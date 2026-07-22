"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, ChevronRight, Copy, Ellipsis, FolderInput, GripVertical, Link as LinkIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";

import type {
  labels as labelsTable,
  projects as projectsTable,
  sections as sectionsTable,
  tasks as tasksTable,
} from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskAddForm } from "./task-add-form";
import { TaskCheckbox } from "./task-checkbox";
import { TaskModal } from "./task-modal";
import { TaskRow } from "./task-row";
import { usePendingAction } from "@/lib/use-pending-action";
import { compareTasks, type SortBy } from "@/lib/task-sort";
import { cn } from "@/lib/utils";
import {
  flattenTaskGroup,
  projectTaskDepth,
  subtreeIds,
  visibleFlatRows,
} from "@/lib/task-tree";

type Label = typeof labelsTable.$inferSelect;
type Project = Pick<typeof projectsTable.$inferSelect, "id" | "name">;
export type TaskWithLabels = typeof tasksTable.$inferSelect & {
  labels: Label[];
  commentCount: number;
};
export type ProjectMember = { id: string; username: string };
export type DropIndicator = {
  anchorId: string | null;
  depth: number;
  sectionId: string | null;
} | null;
type Section = typeof sectionsTable.$inferSelect;

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
      `Deleted "${task.content}"`,
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
    if (ok) await refresh();
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
      `Deleted ${affectedTasks.length} tasks`,
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
  const activeSection = orderedSections.find((section) => section.id === activeId) ?? null;
  const dropIndicator: DropIndicator = projection
    ? {
        anchorId: projection.afterId ?? projection.parentId,
        depth: projection.depth,
        sectionId: projection.sectionId,
      }
    : null;

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
                dropIndicator={dropIndicator}
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
              className="flex cursor-grabbing items-start gap-2 rounded-lg border border-border bg-card py-2.5 pr-3 pl-4 shadow-xl ring-1 ring-black/5"
              style={{
                marginLeft: (projection?.depth ?? 0) * 28,
                width: `calc(100% - ${(projection?.depth ?? 0) * 28}px)`,
              }}
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
            )
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

function TaskGroup({
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
  dropIndicator,
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
  dropIndicator: DropIndicator;
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

  const rows = visibleFlatRows(tasks, id, {
    collapsedIds: collapsedTaskIds,
    hiddenSubtreeOf: activeTaskId,
  });

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
          {dropIndicator?.anchorId === null && dropIndicator.sectionId === id && (
            <span
              aria-hidden
              className="absolute top-0 right-2 h-0.5 rounded-full bg-primary"
              style={{ left: 20 + dropIndicator.depth * 28 }}
            />
          )}
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
                dropIndicator={dropIndicator}
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

function SectionHeading({
  section,
  taskCount,
  selecting,
  collapsed,
  onToggleCollapsed,
  onRename,
  onDelete,
}: {
  section: Section;
  taskCount: number;
  selecting: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRename: (section: Section, name: string) => void;
  onDelete: (section: Section) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [projects, setProjects] = useState<Project[]>([]);
  const cancelled = useRef(false);
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: selecting,
  });

  function beginEditing() {
    cancelled.current = false;
    setName(section.name);
    setEditing(true);
  }

  function cancelEditing() {
    cancelled.current = true;
    setName(section.name);
    setEditing(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setEditing(false);
    if (name.trim() && name !== section.name) onRename(section, name.trim());
  }

  async function runAction(body: object) {
    const response = await fetch(`/api/sections/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) router.refresh();
  }

  async function loadProjects() {
    if (projects.length) return;
    const response = await fetch("/api/projects");
    if (response.ok) setProjects(await response.json());
  }

  if (editing) {
    return (
      <form ref={setNodeRef} onSubmit={submit} className="flex" style={{ transform: CSS.Transform.toString(transform), transition }}>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
        />
      </form>
    );
  }

  return (
    <div
      id={`section-${section.id}`}
      ref={setNodeRef}
      className={cn(
        "group sticky top-0 z-20 mb-2 flex items-center gap-2 bg-background/95 py-1.5 pr-1 pl-7 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        isDragging && "z-0 opacity-40",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Sections drag by the handle only (Todoist behavior); the heading
          itself stays plain so clicks never turn into drags. */}
      <span
        {...attributes}
        {...listeners}
        aria-label="Drag section"
        className="absolute left-1 flex size-5 cursor-grab touch-manipulation items-center justify-center text-muted-foreground opacity-100 transition-opacity active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <GripVertical aria-hidden className="size-4" />
      </span>
      <h2 className="min-w-0">
        <button
          type="button"
          onClick={() => { if (!window.getSelection()?.toString()) beginEditing(); }}
          disabled={selecting}
          className="block max-w-64 cursor-text select-text truncate text-left text-sm font-bold text-foreground disabled:cursor-default"
        >
          {section.name}
        </button>
      </h2>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {taskCount}
      </span>
      <span aria-hidden className="mx-1 h-px min-w-6 flex-1 bg-border/80" />
      {!selecting && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`More options for ${section.name}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
              >
                <Ellipsis className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={beginEditing}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuSub onOpenChange={(open) => { if (open) void loadProjects(); }}>
              <DropdownMenuSubTrigger><FolderInput /> Move to…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {projects.filter((project) => project.id !== section.projectId).map((project) => (
                  <DropdownMenuItem key={project.id} onClick={() => void runAction({ projectId: project.id })}>
                    {project.name}
                  </DropdownMenuItem>
                ))}
                {projects.filter((project) => project.id !== section.projectId).length === 0 && (
                  <p className="px-1.5 py-1 text-xs text-muted-foreground">No other projects</p>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => void runAction({ duplicate: true })}><Copy /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(`${location.origin}/projects/${section.projectId}#section-${section.id}`)}>
              <LinkIcon /> Copy link to section
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void runAction({ isArchived: true })}><Archive /> Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete section "${section.name}"? Its tasks will be deleted too.`)) onDelete(section);
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
      )}
      <button
        type="button"
        aria-label={collapsed ? "Expand section" : "Collapse section"}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
    </div>
  );
}

function CreateSectionForm({
  projectId,
  afterId,
  onCreated,
  onError,
}: {
  projectId: string;
  afterId: string | null;
  onCreated: () => void;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setPending(true);
    const response = await fetch("/api/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name: name.trim(), afterId }),
    });
    setPending(false);

    if (!response.ok) {
      onError();
      return;
    }

    setName("");
    setExpanded(false);
    onCreated();
  }

  if (!expanded) {
    return (
      <div className="group/add-section flex h-8 items-center pl-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover/add-section:opacity-100 hover:text-foreground focus-visible:opacity-100"
          onClick={() => setExpanded(true)}
        >
          <span className="flex size-5 items-center justify-center rounded-md border border-dashed border-border" aria-hidden>
            <Plus className="size-3" />
          </span>
          <span className="shrink-0">New section</span>
          <span className="h-px flex-1 border-t border-dashed border-border" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        autoFocus
        placeholder="Add section"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(false)}
      >
        Cancel
      </Button>
    </form>
  );
}

function BulkToolbar({
  count,
  projects,
  labels,
  onComplete,
  onDelete,
  onMove,
  onPriority,
  onDueDate,
  onLabel,
}: {
  count: number;
  projects: Project[];
  labels: Label[];
  onComplete: () => void;
  onDelete: () => void;
  onMove: (projectId: string) => void;
  onPriority: (priority: number) => void;
  onDueDate: (dueDate: string | null) => void;
  onLabel: (labelId: string) => void;
}) {
  const [dueDate, setDueDate] = useState("");

  return (
    <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
      <span className="px-1 text-sm text-muted-foreground">{count} selected</span>
      <Button size="sm" onClick={onComplete}>Complete</Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
      <Select onValueChange={(value) => typeof value === "string" && onMove(value)}>
        <SelectTrigger size="sm"><SelectValue placeholder="Move" /></SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={(value) => typeof value === "string" && onPriority(Number(value))}>
        <SelectTrigger size="sm"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4].map((priority) => (
            <SelectItem key={priority} value={String(priority)}>P{priority}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        aria-label="Due date"
        className="h-7 w-auto"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <Button size="sm" variant="outline" onClick={() => onDueDate(dueDate || null)}>
        Apply date
      </Button>
      <Select onValueChange={(value) => typeof value === "string" && onLabel(value)}>
        <SelectTrigger size="sm"><SelectValue placeholder="Add label" /></SelectTrigger>
        <SelectContent>
          {labels.map((label) => (
            <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
