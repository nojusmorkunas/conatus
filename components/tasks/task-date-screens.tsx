"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";

import { MobilePageHeader, MobileSidebarTrigger } from "@/components/projects/mobile-sidebar-trigger";
import { ProjectColorDot } from "@/components/projects/project-color-dot";
import { TaskDateList, type TaskDateGroup } from "@/components/tasks/task-date-list";
import type { TaskWithLabels } from "@/components/tasks/types";
import { dueLabel, formatDate } from "@/lib/dates";
import { evaluateFilter, parseFilter, type FilterableTask } from "@/lib/filter";
import { StoreReady, useSnapshot, useTodayDate } from "@/lib/offline/hooks";
import { byOrder } from "@/lib/offline/support";
import type { TaskEntity } from "@/lib/offline/types";
import { taskView } from "@/lib/offline/view";
import { labelTasks, openDueTasks, todayGroups, upcomingDays } from "@/lib/task-views";
import { useRouteId } from "@/lib/use-route-id";

type DateScreenProps = { currentUserId: string; dateFormat: string; emptyState?: ReactNode };

function DateSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2">
      <div className="h-10 rounded-md bg-muted" />
      <div className="h-10 rounded-md bg-muted" />
    </div>
  );
}

/** The local copy the date views draw from, and a row for each task that names the project it lives in. */
function useDateSource() {
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const labelRows = useSnapshot((snapshot) => snapshot.labels);
  const today = useTodayDate();
  const labels = useMemo(() => [...labelRows.values()].sort(byOrder), [labelRows]);
  const row = useCallback(
    (task: TaskEntity): TaskWithLabels => {
      const project = projectRows.get(task.projectId);
      return { ...taskView(task, { labels: labelRows }), projectName: project?.name, projectColor: project?.color, projectIcon: project?.icon };
    },
    [labelRows, projectRows],
  );
  return { taskRows, projectRows, labelRows, labels, today, row };
}

export function TodayScreen({ currentUserId, dateFormat, emptyState }: DateScreenProps) {
  return (
    <StoreReady fallback={<DateSkeleton />}>
      <Today currentUserId={currentUserId} dateFormat={dateFormat} emptyState={emptyState} />
    </StoreReady>
  );
}

function Today({ currentUserId, dateFormat, emptyState }: DateScreenProps) {
  const { taskRows, projectRows, labels, today, row } = useDateSource();
  const groups = useMemo<TaskDateGroup[]>(() => {
    const due = todayGroups(taskRows.values(), projectRows, today);
    return [
      { heading: "Overdue", tasks: due.overdue.map(row) },
      { heading: "Today", tasks: due.today.map(row) },
    ];
  }, [taskRows, projectRows, today, row]);
  return <TaskDateList groups={groups} labels={labels} currentUserId={currentUserId} today={today} dateFormat={dateFormat} emptyState={emptyState} />;
}

export function UpcomingScreen({ currentUserId, dateFormat, emptyState }: DateScreenProps) {
  return (
    <StoreReady fallback={<DateSkeleton />}>
      <Upcoming currentUserId={currentUserId} dateFormat={dateFormat} emptyState={emptyState} />
    </StoreReady>
  );
}

function Upcoming({ currentUserId, dateFormat, emptyState }: DateScreenProps) {
  const { taskRows, projectRows, labels, today, row } = useDateSource();
  const groups = useMemo<TaskDateGroup[]>(
    () =>
      upcomingDays(taskRows.values(), projectRows, today).map(({ day, tasks }) => {
        const label = dueLabel(day, today, dateFormat);
        const heading = label === formatDate(day, dateFormat) ? label : `${label} · ${formatDate(day, dateFormat)}`;
        return { heading, tasks: tasks.map(row) };
      }),
    [taskRows, projectRows, today, dateFormat, row],
  );
  return <TaskDateList groups={groups} labels={labels} currentUserId={currentUserId} today={today} dateFormat={dateFormat} emptyState={emptyState} />;
}

export function LabelScreen({ currentUserId, dateFormat }: DateScreenProps) {
  return (
    <StoreReady fallback={<DateSkeleton />}>
      <Label currentUserId={currentUserId} dateFormat={dateFormat} />
    </StoreReady>
  );
}

function Label({ currentUserId, dateFormat }: DateScreenProps) {
  const id = useRouteId();
  const { taskRows, projectRows, labelRows, labels, today, row } = useDateSource();
  const label = labelRows.get(id);
  const groups = useMemo<TaskDateGroup[]>(
    () => (label ? [{ heading: label.name, tasks: labelTasks(taskRows.values(), projectRows, label.id).map(row) }] : []),
    [label, taskRows, projectRows, row],
  );
  if (!label) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 p-6">
        <MobileSidebarTrigger />
        <p className="text-sm text-muted-foreground">This label doesn&apos;t exist, or you can&apos;t reach it.</p>
        <Link href="/today" className="text-sm underline underline-offset-2">Go to Today</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <MobilePageHeader className="mb-6">
        <ProjectColorDot color={label.color} />
        <h1 className="text-xl font-semibold">{label.name}</h1>
      </MobilePageHeader>
      {groups[0].tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching tasks.</p>
      ) : (
        <TaskDateList groups={groups} labels={labels} currentUserId={currentUserId} today={today} dateFormat={dateFormat} />
      )}
    </div>
  );
}

/** A saved filter's tasks, evaluated on the local copy, which is also where the filter itself comes from. */
export function FilterScreen({ currentUserId, dateFormat }: DateScreenProps) {
  return (
    <StoreReady fallback={<DateSkeleton />}>
      <Filtered currentUserId={currentUserId} dateFormat={dateFormat} />
    </StoreReady>
  );
}

function Filtered({ currentUserId, dateFormat }: DateScreenProps) {
  const id = useRouteId();
  const { taskRows, projectRows, labelRows, labels, today, row } = useDateSource();
  const filter = useSnapshot((snapshot) => snapshot.filters.get(id));
  const query = filter?.query ?? "";
  const parsed = useMemo(() => parseFilter(query), [query]);
  const matches = useMemo(() => {
    if (!filter || "error" in parsed) return [];
    return openDueTasks(taskRows.values(), projectRows).filter((task) => {
      const filterable: FilterableTask = {
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        priority: task.priority as 1 | 2 | 3 | 4,
        isCompleted: task.isCompleted,
        projectName: projectRows.get(task.projectId)!.name,
        labelNames: task.labelIds.flatMap((id) => labelRows.get(id)?.name ?? []),
      };
      return evaluateFilter(parsed.ast, filterable, { today, monthFirst: dateFormat === "MM/dd/yyyy" });
    });
  }, [filter, parsed, taskRows, projectRows, labelRows, today, dateFormat]);
  const name = filter?.name ?? "";
  const groups = useMemo<TaskDateGroup[]>(() => [{ heading: name, tasks: matches.map(row) }], [name, matches, row]);
  if (!filter) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 p-6">
        <MobileSidebarTrigger />
        <p className="text-sm text-muted-foreground">This filter doesn&apos;t exist, or you can&apos;t reach it.</p>
        <Link href="/today" className="text-sm underline underline-offset-2">Go to Today</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="mb-6">
        <MobilePageHeader>
          <h1 className="text-xl font-semibold">{filter.name}</h1>
        </MobilePageHeader>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{filter.query}</p>
      </div>
      {"error" in parsed ? (
        <p className="text-sm text-destructive">This filter&apos;s query is no longer valid: {parsed.error}</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching tasks.</p>
      ) : (
        <TaskDateList groups={groups} labels={labels} currentUserId={currentUserId} today={today} dateFormat={dateFormat} />
      )}
    </div>
  );
}
