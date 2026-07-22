"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  Repeat,
  Timer,
  Trash2,
  UserPlus,
  GripVertical,
  Tag,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { labels as labelsTable } from "@/lib/db/schema";
import { dueLabel, pastDateLabel } from "@/lib/dates";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { DropIndicator, ProjectMember, TaskWithLabels } from "./task-list";

type Label = typeof labelsTable.$inferSelect;

export function TaskRow({
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
  dropIndicator = null,
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
  onToggle: (task: TaskWithLabels) => void;
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
  dropIndicator?: DropIndicator;
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
  const siblings = allTasks
    .filter((candidate) => candidate.parentId === task.parentId && candidate.sectionId === task.sectionId)
    .sort((a, b) => (a.order < b.order ? -1 : 1));
  const previousSibling = siblings[siblings.findIndex((candidate) => candidate.id === task.id) - 1];

  useEffect(() => () => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
  }, []);

  function handleToggle() {
    if (task.isCompleted) {
      onToggle(task);
      return;
    }
    if (isCompleting) return;

    setCompletionHeight(shellRef.current?.scrollHeight ?? null);
    setIsCompleting(true);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    completionTimer.current = setTimeout(() => onToggle(task), reduceMotion ? 0 : 480);
  }

  return (
    <div
      ref={(node) => {
        shellRef.current = node;
        setNodeRef(node);
      }}
      className={cn(
        "task-row-shell flex flex-col",
        isCompleting && "task-row-shell-completing",
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
            afterId={previousSibling?.id ?? null}
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
          "task-row group relative mb-0.5 flex items-start gap-2 rounded-lg py-2.5 pr-2 transition-colors hover:bg-muted/55",
          selecting && "cursor-pointer",
          draggable && "touch-pan-y select-none cursor-pointer",
          isDragging && "z-0 cursor-grabbing opacity-40 hover:bg-transparent",
        )}
        style={{
          "--task-mobile-indent": `${depth * 20}px`,
          paddingLeft: 44 + depth * 28,
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
        {dropIndicator?.anchorId === task.id && dropIndicator.sectionId === task.sectionId && (
          <span
            aria-hidden
            className="absolute right-2 -bottom-px h-0.5 rounded-full bg-primary"
            style={{ left: 20 + dropIndicator.depth * 28 }}
          />
        )}
        {draggable && (
          <GripVertical
            aria-hidden
            className="task-row-drag-handle absolute top-2.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: depth * 28 + (directChildren.length > 0 ? 4 : 20) }}
          />
        )}
        {selecting ? (
          <input
            type="checkbox"
            aria-label={selected ? "Deselect task" : "Select task"}
            checked={selected}
            className="mt-0.5 size-5 shrink-0 accent-primary"
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

export function AssigneeChip({
  assigneeId,
  members,
  currentUserId,
}: {
  assigneeId: string | null;
  members: ProjectMember[];
  currentUserId: string;
}) {
  const assignee = members.find((member) => member.id === assigneeId);
  if (!assignee) return null;

  return (
    <span
      title={assignee.username}
      aria-label={`Assigned to ${assignee.username}`}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground",
        assignee.id === currentUserId &&
          "bg-primary/10 text-primary ring-1 ring-primary/50",
      )}
    >
      {assignee.username.charAt(0).toUpperCase()}
    </span>
  );
}

function AssigneeEditor({
  assigneeId,
  members,
  onAssign,
  onCancel,
}: {
  assigneeId: string | null;
  members: ProjectMember[];
  onAssign: (assigneeId: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Select
        value={assigneeId ?? undefined}
        onValueChange={(value) => {
          if (typeof value === "string") onAssign(value);
        }}
      >
        <SelectTrigger size="sm" aria-label="Assignee">
          <SelectValue placeholder="Choose member" />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {assigneeId && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onAssign(null)}>
          Unassign
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function DueChip({
  task,
  today,
  dateFormat,
}: {
  task: Pick<TaskWithLabels, "dueDate" | "dueTime" | "recurrence">;
  today: string;
  dateFormat: string;
}) {
  if (!task.dueDate) return null;
  const tomorrow = addDays(today, 1);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        task.dueDate < today
          ? "text-red-500"
          : task.dueDate === today
            ? "text-green-600"
            : task.dueDate === tomorrow
              ? "text-orange-500"
              : "text-muted-foreground",
      )}
    >
      {task.recurrence && <Repeat aria-label={`Repeats ${task.recurrence}`} className="size-3.5" />}
      <CalendarDays className="size-3.5" />
      {dueLabel(task.dueDate, today, dateFormat)}
      {task.dueTime && ` ${task.dueTime}`}
      {task.recurrence && <span className="sr-only">, repeats {task.recurrence}</span>}
    </span>
  );
}

// Deadline = must-finish-by, distinct from the due chip above (when to work
// on it). Flag icon + red past / amber today keeps it visually separate.
export function DeadlineChip({
  task,
  today,
  dateFormat,
}: {
  task: Pick<TaskWithLabels, "deadlineDate">;
  today: string;
  dateFormat: string;
}) {
  if (!task.deadlineDate) return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        task.deadlineDate < today
          ? "text-red-500"
          : task.deadlineDate === today
            ? "text-amber-500"
            : "text-muted-foreground",
      )}
    >
      <Flag className="size-3.5" />
      {task.deadlineDate < today
        ? pastDateLabel(task.deadlineDate, today, dateFormat)
        : dueLabel(task.deadlineDate, today, dateFormat)}
    </span>
  );
}

function humanizeDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function DurationChip({
  task,
}: {
  task: Pick<TaskWithLabels, "durationMinutes">;
}) {
  if (!task.durationMinutes) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Timer className="size-3.5" />
      {humanizeDuration(task.durationMinutes)}
    </span>
  );
}

function DueEditor({
  dueDate,
  dueTime,
  deadlineDate,
  durationMinutes,
  onSave,
  onCancel,
}: {
  dueDate: string | null;
  dueTime: string | null;
  deadlineDate: string | null;
  durationMinutes: number | null;
  onSave: (
    dueDate: string | null,
    dueTime: string | null,
    deadlineDate: string | null,
    durationMinutes: number | null,
  ) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(dueDate ?? "");
  const [time, setTime] = useState(dueTime ?? "");
  const [deadline, setDeadline] = useState(deadlineDate ?? "");
  const [duration, setDuration] = useState(durationMinutes ? String(durationMinutes) : "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSave(date || null, date && time ? time : null, deadline || null, duration ? Number(duration) : null);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-1">
      <Input
        type="date"
        autoFocus
        className="w-auto"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <Input
        type="time"
        className="w-auto"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <span className="flex items-center gap-1">
        <Flag className="size-3 text-muted-foreground" aria-hidden />
        <Input
          type="date"
          aria-label="Deadline"
          className="w-auto"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
        {deadline && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeadline("")}>
            Clear
          </Button>
        )}
      </span>
      <span className="flex items-center gap-1">
        <Timer className="size-3 text-muted-foreground" aria-hidden />
        <Input
          type="number"
          min={1}
          max={1440}
          aria-label="Duration (minutes)"
          placeholder="min"
          className="w-20"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
        {duration && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDuration("")}>
            Clear
          </Button>
        )}
      </span>
      <Button type="submit" size="sm">
        Save
      </Button>
      {dueDate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSave(null, null, deadline || null, duration ? Number(duration) : null)}
        >
          Clear
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

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
        <DropdownMenuItem variant="destructive" onClick={() => run(onDelete)}><Trash2 />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
