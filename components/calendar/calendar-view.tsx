"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import type { tasks as tasksTable } from "@/lib/db/schema";
import { addDays, formatDate, monthGridStart } from "@/lib/dates";
import { priorityColors } from "@/components/tasks/priority";
import { cn } from "@/lib/utils";

type Task = typeof tasksTable.$inferSelect;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 48;

function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function CalendarView({
  view,
  month,
  week,
  tasks: initialTasks,
  today,
  dateFormat,
  weekStart,
}: {
  view: "month" | "week";
  month: string;
  week: string;
  tasks: Task[];
  today: string;
  dateFormat: string;
  weekStart: number;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
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

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const taskId = String(active.id);
    const date = String(over.id);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.dueDate === date) return;

    setTasks((current) =>
      current.map((existing) =>
        existing.id === taskId ? { ...existing, dueDate: date } : existing,
      ),
    );

    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: date }),
    });
    if (!response.ok) {
      setError("That didn't work. Try again.");
      router.refresh();
    }
  }

  const prevHref =
    view === "week"
      ? `/calendar?view=week&week=${addDays(week, -7)}`
      : `/calendar?view=month&month=${addMonths(month, -1)}`;
  const nextHref =
    view === "week"
      ? `/calendar?view=week&week=${addDays(week, 7)}`
      : `/calendar?view=month&month=${addMonths(month, 1)}`;
  const todayHref =
    view === "week" ? `/calendar?view=week&week=${today}` : `/calendar?view=month&month=${today.slice(0, 7)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
          <Link aria-label="Previous period" href={prevHref} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-2 py-1 text-sm hover:bg-muted sm:min-h-0 sm:min-w-0">
            ‹
          </Link>
          <Link href={todayHref} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-1 text-sm hover:bg-muted sm:min-h-0">
            Today
          </Link>
          <Link aria-label="Next period" href={nextHref} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-2 py-1 text-sm hover:bg-muted sm:min-h-0 sm:min-w-0">
            ›
          </Link>
          <span className="order-last w-full text-sm font-medium sm:order-none sm:ml-2 sm:w-auto">
            {view === "month" ? month : `${formatDate(week, dateFormat)} – ${formatDate(addDays(week, 6), dateFormat)}`}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-sm">
          <Link
            href={`/calendar?view=month&month=${month}`}
            className={cn("inline-flex min-h-11 items-center rounded px-2 py-1 sm:min-h-0", view === "month" && "bg-muted font-medium")}
          >
            Month
          </Link>
          <Link
            href={`/calendar?view=week&week=${week}`}
            className={cn("inline-flex min-h-11 items-center rounded px-2 py-1 sm:min-h-0", view === "week" && "bg-muted font-medium")}
          >
            Week
          </Link>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <DndContext id="calendar-view" sensors={sensors} onDragEnd={handleDragEnd}>
        {view === "month" ? (
          <MonthGrid month={month} tasks={tasks} today={today} weekStart={weekStart} />
        ) : (
          <WeekGrid week={week} tasks={tasks} today={today} />
        )}
      </DndContext>
    </div>
  );
}

function MonthGrid({
  month,
  tasks,
  today,
  weekStart,
}: {
  month: string;
  tasks: Task[];
  today: string;
  weekStart: number;
}) {
  const start = monthGridStart(month, weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const orderedLabels = [...WEEKDAY_LABELS.slice(weekStart), ...WEEKDAY_LABELS.slice(0, weekStart)];

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
      {orderedLabels.map((label) => (
        <div key={label} className="bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {label}
        </div>
      ))}
      {days.map((date) => (
        <DayCell
          key={date}
          date={date}
          inMonth={date.slice(0, 7) === month}
          isToday={date === today}
          tasks={tasks.filter((task) => task.dueDate === date)}
        />
      ))}
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
  tasks,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, 3);
  const hidden = tasks.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-24 flex-col gap-1 bg-background p-1",
        !inMonth && "bg-muted/20 text-muted-foreground",
        isOver && "bg-accent/40",
      )}
    >
      <span
        className={cn(
          "self-start rounded-full px-1.5 text-xs",
          isToday && "bg-primary text-primary-foreground font-medium",
        )}
      >
        {Number(date.slice(-2))}
      </span>
      <div className="flex flex-col gap-0.5">
        {shown.map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
        {hidden > 0 && (
          <button type="button" className="min-h-11 px-1 text-left text-xs text-muted-foreground underline-offset-2 hover:underline sm:min-h-6" onClick={() => setExpanded(true)}>
            +{hidden} more
          </button>
        )}
        {expanded && tasks.length > 3 && (
          <button type="button" className="min-h-11 px-1 text-left text-xs text-muted-foreground underline-offset-2 hover:underline sm:min-h-6" onClick={() => setExpanded(false)}>
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function TaskChip({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <Link
      href={`/projects/${task.projectId}?task=${task.id}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="link"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "flex min-h-11 cursor-grab touch-auto select-none items-center gap-1 truncate rounded border border-border bg-background px-1 py-0.5 text-sm sm:min-h-0 sm:text-xs",
        isDragging && "opacity-50",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full border-2", priorityColors[task.priority])} />
      <span className="truncate">{task.content}</span>
      {task.dueTime && <span className="shrink-0 text-muted-foreground">{task.dueTime}</span>}
    </Link>
  );
}

function WeekGrid({ week, tasks, today }: { week: string; tasks: Task[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
      <div className="grid grid-cols-8 border-b border-border">
        <div className="border-r border-border" />
        {days.map((date) => (
          <div
            key={date}
            className={cn(
              "border-r border-border px-2 py-1 text-center text-xs font-medium last:border-r-0",
              date === today && "bg-accent/40",
            )}
          >
            {WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]} {Number(date.slice(-2))}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-8 border-b border-border">
        <div className="border-r border-border px-1 py-1 text-xs text-muted-foreground">All day</div>
        {days.map((date) => (
          <AllDayLane key={date} date={date} tasks={tasks.filter((t) => t.dueDate === date && !t.dueTime)} />
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto"
        ref={(node) => {
          // Scroll to a useful default on mount; 8am covers most schedules.
          if (node && scrollRef.current === null) node.scrollTop = 8 * HOUR_HEIGHT;
          scrollRef.current = node;
        }}
      >
        <div className="relative grid grid-cols-8">
          <div className="border-r border-border">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className="border-b border-border px-1 text-right text-xs text-muted-foreground"
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((date) => (
            <HourColumn key={date} date={date} tasks={tasks.filter((t) => t.dueDate === date && t.dueTime)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AllDayLane({ date, tasks }: { date: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-8 flex-col gap-0.5 border-r border-border p-0.5 last:border-r-0",
        isOver && "bg-accent/40",
      )}
    >
      {tasks.map((task) => (
        <TaskChip key={task.id} task={task} />
      ))}
    </div>
  );
}

function HourColumn({ date, tasks }: { date: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={cn("relative border-r border-border last:border-r-0", isOver && "bg-accent/40")}
      style={{ height: HOUR_HEIGHT * 24 }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-border" />
      ))}
      {/* ponytail: overlapping blocks stack with a slight offset instead of a side-by-side split; fine at personal-calendar density */}
      {tasks.map((task, index) => (
        <TimeBlock key={task.id} task={task} offset={index} />
      ))}
    </div>
  );
}

function TimeBlock({ task, offset }: { task: Task; offset: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const [hour, minute] = task.dueTime!.split(":").map(Number);
  const top = (hour + minute / 60) * HOUR_HEIGHT;
  const height = Math.max(((task.durationMinutes ?? 60) / 60) * HOUR_HEIGHT, 20);

  return (
    <Link
      href={`/projects/${task.projectId}?task=${task.id}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="link"
      style={{
        top,
        height,
        left: 2 + offset * 10,
        right: 2,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "absolute z-10 flex min-h-11 cursor-grab touch-auto select-none flex-col overflow-hidden rounded border border-border bg-background px-1 py-0.5 text-xs shadow-sm sm:min-h-0",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1">
        <span className={cn("size-1.5 shrink-0 rounded-full border-2", priorityColors[task.priority])} />
        <span className="truncate font-medium">{task.content}</span>
      </div>
      <span className="text-muted-foreground">{task.dueTime}</span>
    </Link>
  );
}
