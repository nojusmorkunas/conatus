"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  ChevronRight,
  Copy,
  Ellipsis,
  Flag,
  FolderInput,
  Link,
  ListTree,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  GripVertical,
  Tag,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LabelChip } from "@/components/labels/label-chip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskCheckbox } from "./task-checkbox";
import { TaskAddForm } from "./task-add-form";
import { AssigneeChip, DeadlineChip, DueChip, DurationChip } from "./task-chips";
import { AssigneeEditor, DueEditor } from "./task-editors";
import type { Label, ProjectMember, TaskWithLabels } from "./types";

function TaskRowComponent({
  task,
  allTasks,
  labels,
  members = [],
  currentUserId = "",
  depth,
  today,
  dateFormat,
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
  selecting = false,
  selected = false,
  onSelectionToggle,
  draggable = false,
  activeProjectedDepth = null,
  collapsed = false,
  onToggleCollapsed,
  onError = () => {},
}: {
  task: TaskWithLabels;
  allTasks: TaskWithLabels[];
  labels: Label[];
  members?: ProjectMember[];
  currentUserId?: string;
  depth: number;
  today: string;
  dateFormat: string;
  onToggle: (task: TaskWithLabels) => void | Promise<unknown>;
  onDelete: (task: TaskWithLabels) => void;
  onLabelsChange: (task: TaskWithLabels, labelIds: string[]) => void;
  onAssigneeChange?: (task: TaskWithLabels, assigneeId: string | null) => void;
  onDueChange: (
    task: TaskWithLabels,
    dueDate: string | null,
    dueTime: string | null,
    deadlineDate: string | null,
    durationMinutes: number | null,
  ) => void;
  onQuickDueChange?: (task: TaskWithLabels, dueDate: string | null) => void;
  onPriorityChange?: (task: TaskWithLabels, priority: number) => void;
  onMove?: (task: TaskWithLabels, projectId: string) => void;
  onDuplicate?: (task: TaskWithLabels) => void;
  onSubtaskAdded: () => void;
  onOpenDetail: (task: TaskWithLabels) => void;
  selecting?: boolean;
  selected?: boolean;
  onSelectionToggle?: (task: TaskWithLabels) => void;
  draggable?: boolean;
  activeProjectedDepth?: number | null;
  collapsed?: boolean;
  onToggleCollapsed?: (taskId: string) => void;
  onError?: () => void;
}) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [addingTask, setAddingTask] = useState<"above" | "below" | null>(null);
  const [editingDue, setEditingDue] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionHeight, setCompletionHeight] = useState<number | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  const directChildren = allTasks
    .filter((candidate) => candidate.parentId === task.id)
    .sort((a, b) => (a.order < b.order ? -1 : 1));
  const completedChildren = directChildren.filter((child) => child.isCompleted).length;
  const hasMetadata =
    directChildren.length > 0 ||
    Boolean(task.dueDate || task.deadlineDate || task.durationMinutes || task.commentCount) ||
    (members.length > 1 && Boolean(task.assigneeId)) ||
    task.labels.length > 0;
  // Only needed when the "add task above" form is open, so compute it on demand
  // rather than scanning the whole list on every render.
  function previousSiblingId(): string | null {
    const siblings = allTasks
      .filter((candidate) => candidate.parentId === task.parentId && candidate.sectionId === task.sectionId)
      .sort((a, b) => (a.order < b.order ? -1 : 1));
    const index = siblings.findIndex((candidate) => candidate.id === task.id);
    return index > 0 ? siblings[index - 1].id : null;
  }

  useEffect(() => () => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
  }, []);

  // A repeating task is not leaving the list: completing it moves it to its
  // next due date. The row's collapse animation would play it out and then
  // snap it back, so it only gets the checkbox celebration.
  const repeats = Boolean(task.recurrence && task.dueDate);

  function handleToggle() {
    if (task.isCompleted) {
      onToggle(task);
      return;
    }
    if (isCompleting) return;

    if (!repeats) setCompletionHeight(shellRef.current?.scrollHeight ?? null);
    setIsCompleting(true);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Clear the celebration once the toggle settles. A recurring task stays on
    // screen with a new due date instead of unmounting, so leaving this set
    // would strand its checkbox ticked on a task that is not complete.
    completionTimer.current = setTimeout(() => {
      void Promise.resolve(onToggle(task)).finally(() => setIsCompleting(false));
    }, reduceMotion ? 0 : 480);
  }

  return (
    <div
      ref={(node) => {
        shellRef.current = node;
        setNodeRef(node);
      }}
      className={cn(
        "task-row-shell flex flex-col",
        isCompleting && !repeats && "task-row-shell-completing",
      )}
      style={{
        "--task-row-height": completionHeight ? `${completionHeight}px` : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
      } as CSSProperties}
    >
      {addingTask === "above" && (
        <div style={{ paddingLeft: 8 + depth * 28 }}>
          <TaskAddForm
            projectId={task.projectId}
            sectionId={task.sectionId}
            parentId={task.parentId ?? undefined}
            afterId={previousSiblingId()}
            today={today}
            labels={labels}
            initiallyExpanded
            onCreated={() => { setAddingTask(null); onSubtaskAdded(); }}
            onError={onError}
          />
        </div>
      )}
      <div
        data-task-id={task.id}
        data-task-content={task.content}
        data-has-children={directChildren.length > 0}
        {...attributes}
        {...listeners}
        role="group"
        aria-label={`Task: ${task.content}`}
        tabIndex={0}
        onMouseDown={(event) => {
          // Only real controls opt out of row-drag. The row itself carries
          // role="button" from dnd-kit attributes, so a [role=button] check
          // would match every press and kill dragging entirely.
          const control = (event.target as Element).closest?.(
            "button, input, a, textarea, select",
          );
          if (control && control !== event.currentTarget) return;
          listeners?.onMouseDown?.(event);
        }}
        onTouchStart={(event) => {
          const control = (event.target as Element).closest?.(
            "button, input, a, textarea, select",
          );
          if (control && control !== event.currentTarget) return;
          listeners?.onTouchStart?.(event);
        }}
        className={cn(
          "task-row group relative mb-0.5 flex items-start gap-2 py-2.5 pr-2",
          selecting && "cursor-pointer",
          draggable && "touch-pan-y select-none cursor-pointer",
          isDragging && "is-dragging z-0 cursor-grabbing",
        )}
        style={{
          // While dragging, the row indents live to the projected drop depth
          // so it previews exactly where — and at what nesting level — it lands.
          "--row-depth": isDragging && activeProjectedDepth !== null ? activeProjectedDepth : depth,
        } as CSSProperties}
        onClick={(event) => {
          if (selecting) {
            onSelectionToggle?.(task);
            return;
          }
          // Click anywhere opens the task; real controls (checkbox, menus,
          // links) handle their own clicks. After a real drag dnd-kit swallows
          // the trailing click, so dropping a task never opens it.
          const control = (event.target as Element).closest?.(
            "button, input, a, textarea, select",
          );
          if (control) return;
          onOpenDetail(task);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || selecting) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetail(task);
          }
        }}
      >
        {draggable && (
          <GripVertical
            aria-hidden
            className="task-row-drag-handle absolute top-2.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: "calc(var(--row-depth, 0) * var(--task-indent-step) + 4px)" }}
          />
        )}
        {selecting ? (
          <input
            type="checkbox"
            aria-label={selected ? "Deselect task" : "Select task"}
            checked={selected}
            className="mt-0.5 size-5 shrink-0 accent-primary sm:mt-0"
            onClick={(event) => event.stopPropagation()}
            onChange={() => onSelectionToggle?.(task)}
          />
        ) : (
          <TaskCheckbox
            priority={task.priority}
            checked={task.isCompleted || isCompleting}
            celebrating={isCompleting}
            onToggle={handleToggle}
          />
        )}

        <div className="min-w-0 flex-1">
          <TaskContent task={task} />

          {task.description?.trim() && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground sm:text-xs">
              {task.description}
            </p>
          )}

          {hasMetadata && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {directChildren.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <ListTree className="size-3.5" />
                  {completedChildren}/{directChildren.length}
                </span>
              )}
              <DueChip task={task} today={today} dateFormat={dateFormat} />
              <DeadlineChip task={task} today={today} dateFormat={dateFormat} />
              <DurationChip task={task} />
              {task.commentCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <MessageCircle className="size-3.5" />
                  {task.commentCount}
                </span>
              )}
              {members.length > 1 && (
                <AssigneeChip
                  assigneeId={task.assigneeId}
                  members={members}
                  currentUserId={currentUserId}
                />
              )}
              {task.labels.map((label) => (
                <LabelChip key={label.id} label={label} subtle />
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "absolute top-1.5 right-1.5 flex items-center gap-0.5",
            !selecting && "rounded-md bg-muted px-0.5 py-0.5 opacity-100 shadow-sm ring-1 ring-border/80 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100",
          )}
        >
          {directChildren.length > 0 && (
            <button
              type="button"
              aria-label={collapsed ? "Expand subtasks" : "Collapse subtasks"}
              className="flex size-5 items-center justify-center text-muted-foreground after:absolute after:-inset-3"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapsed?.(task.id);
              }}
            >
              <ChevronRight className={cn("size-3 transition-transform", !collapsed && "rotate-90")} />
            </button>
          )}
          {!selecting && (
            <TaskContextMenu
              task={task}
              today={today}
              onAddAbove={() => setAddingTask("above")}
              onAddBelow={() => setAddingTask("below")}
              onAddSubtask={() => setAddingSubtask(true)}
              onEdit={() => onOpenDetail(task)}
              onSetDue={() => setEditingDue(true)}
              canAssign={members.length > 1}
              onAssign={() => setEditingAssignee(true)}
              labels={labels}
              selectedLabelIds={task.labels.map((label) => label.id)}
              onLabelsChange={(labelIds) => onLabelsChange(task, labelIds)}
              onDueDate={(dueDate) => onQuickDueChange?.(task, dueDate)}
              onPriority={(priority) => onPriorityChange?.(task, priority)}
              onDeadline={() => setEditingDue(true)}
              onReminders={() => onOpenDetail(task)}
              onMove={(projectId) => onMove?.(task, projectId)}
              onDuplicate={() => onDuplicate?.(task)}
              onDelete={() => onDelete(task)}
            />
          )}
        </div>
      </div>

      {addingTask === "below" && (
        <div style={{ paddingLeft: 8 + depth * 28 }}>
          <TaskAddForm
            projectId={task.projectId}
            sectionId={task.sectionId}
            parentId={task.parentId ?? undefined}
            afterId={task.id}
            today={today}
            labels={labels}
            initiallyExpanded
            onCreated={() => { setAddingTask(null); onSubtaskAdded(); }}
            onError={onError}
          />
        </div>
      )}

      {editingDue && (
        <div style={{ paddingLeft: 8 + (depth + 1) * 28 }}>
          <DueEditor
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            deadlineDate={task.deadlineDate}
            durationMinutes={task.durationMinutes}
            onSave={(dueDate, dueTime, deadlineDate, durationMinutes) => {
              setEditingDue(false);
              onDueChange(task, dueDate, dueTime, deadlineDate, durationMinutes);
            }}
            onCancel={() => setEditingDue(false)}
          />
        </div>
      )}

      {editingAssignee && members.length > 1 && (
        <div style={{ paddingLeft: 8 + (depth + 1) * 28 }}>
          <AssigneeEditor
            assigneeId={task.assigneeId}
            members={members}
            onAssign={(assigneeId) => {
              setEditingAssignee(false);
              onAssigneeChange?.(task, assigneeId);
            }}
            onCancel={() => setEditingAssignee(false)}
          />
        </div>
      )}

      {addingSubtask && (
        <div style={{ paddingLeft: 8 + (depth + 1) * 28 }}>
          <TaskAddForm
            projectId={task.projectId}
            sectionId={task.sectionId}
            parentId={task.id}
            today={today}
            labels={labels}
            onCreated={() => {
              setAddingSubtask(false);
              onSubtaskAdded();
            }}
            onError={() => {}}
          />
        </div>
      )}

    </div>
  );
}

// Rows re-render a lot during a drag (the projection updates on every pointer
// move) and each row does O(n) work deriving its children/siblings. Memoizing
// on the data props — and treating the event handlers as stable — lets rows
// that aren't the dragged one, or reflowing, skip the render entirely. The
// handlers are safe to ignore: any task change flows in through `allTasks`,
// which forces a re-render, so a memoized row never holds a stale closure.
export const TaskRow = memo(TaskRowComponent, (prev, next) =>
  prev.task === next.task &&
  prev.allTasks === next.allTasks &&
  prev.labels === next.labels &&
  prev.members === next.members &&
  prev.currentUserId === next.currentUserId &&
  prev.depth === next.depth &&
  prev.today === next.today &&
  prev.dateFormat === next.dateFormat &&
  prev.selecting === next.selecting &&
  prev.selected === next.selected &&
  prev.draggable === next.draggable &&
  prev.collapsed === next.collapsed &&
  prev.activeProjectedDepth === next.activeProjectedDepth,
);

function TaskContent({ task }: { task: TaskWithLabels }) {
  return <div className="text-base select-none sm:text-sm">{task.content}</div>;
}

function TaskContextMenu({
  task,
  today,
  onAddAbove,
  onAddBelow,
  onAddSubtask,
  onEdit,
  onSetDue,
  canAssign,
  onAssign,
  labels,
  selectedLabelIds,
  onLabelsChange,
  onDueDate,
  onPriority,
  onDeadline,
  onReminders,
  onMove,
  onDuplicate,
  onDelete,
}: {
  task: TaskWithLabels;
  today: string;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onAddSubtask: () => void;
  onEdit: () => void;
  onSetDue: () => void;
  canAssign: boolean;
  onAssign: () => void;
  labels: Label[];
  selectedLabelIds: string[];
  onLabelsChange: (labelIds: string[]) => void;
  onDueDate: (dueDate: string | null) => void;
  onPriority: (priority: number) => void;
  onDeadline: () => void;
  onReminders: () => void;
  onMove: (projectId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  function run(action: () => void) {
    action();
    setOpen(false);
  }

  async function loadProjects() {
    if (projects.length) return;
    const response = await fetch("/api/projects");
    if (response.ok) setProjects(await response.json());
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="More task actions"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Ellipsis className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56" onPointerDown={(event) => event.stopPropagation()}>
        <DropdownMenuItem onClick={() => run(onAddAbove)}><ArrowUp />Add task above</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onAddBelow)}><ArrowDown />Add task below</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onAddSubtask)}><Plus />Add subtask</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onEdit)}><Pencil />Open</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onSetDue)}><CalendarDays />Set date…</DropdownMenuItem>
        {canAssign && <DropdownMenuItem onClick={() => run(onAssign)}><UserPlus />Assign…</DropdownMenuItem>}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Tag />Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {labels.map((label) => {
              const checked = selectedLabelIds.includes(label.id);
              return (
                <DropdownMenuCheckboxItem
                  key={label.id}
                  checked={checked}
                  onCheckedChange={() => onLabelsChange(
                    checked
                      ? selectedLabelIds.filter((id) => id !== label.id)
                      : [...selectedLabelIds, label.id],
                  )}
                >
                  {label.name}
                </DropdownMenuCheckboxItem>
              );
            })}
            {labels.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No labels</p>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-2 gap-1 p-1" aria-label="Quick date">
          {([
            ["Today", today],
            ["Tomorrow", addDays(today, 1)],
            ["Next week", addDays(today, 7)],
            ["No date", null],
          ] as const).map(([label, dueDate]) => (
            <Button key={label} variant="ghost" size="sm" className="justify-start" aria-label={label} onClick={() => run(() => onDueDate(dueDate))}>
              <CalendarDays className="size-3.5" />
              <span>{label}</span>
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1 p-1" aria-label="Quick priority">
          {[1, 2, 3, 4].map((priority) => (
            <Button key={priority} variant="ghost" size="sm" className="gap-0.5 px-1" aria-label={`Priority ${priority}`} onClick={() => run(() => onPriority(priority))}>
              <Flag className={cn("size-3.5 fill-current", ["text-red-500", "text-orange-500", "text-blue-500", "text-muted-foreground"][priority - 1])} />
              <span>P{priority}</span>
            </Button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run(onDeadline)}><CalendarDays />Deadline</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onReminders)}><Bell />Reminders</DropdownMenuItem>
        <DropdownMenuSub onOpenChange={(nextOpen) => { if (nextOpen) void loadProjects(); }}>
          <DropdownMenuSubTrigger><FolderInput />Move to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {projects.map((project) => (
              <DropdownMenuItem key={project.id} onClick={() => run(() => onMove(project.id))}>{project.name}</DropdownMenuItem>
            ))}
            {projects.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">Loading projects…</p>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run(onDuplicate)}><Copy />Duplicate</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(() => {
          void navigator.clipboard.writeText(`${location.origin}/projects/${task.projectId}?task=${task.id}`);
        })}><Link />Copy link to task</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => run(onDelete)}><Trash2 />Move to Trash</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
