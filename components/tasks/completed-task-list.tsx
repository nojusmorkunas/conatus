"use client";

import { useMemo } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dateInTimezone, pastDateLabel } from "@/lib/dates";
import { StoreReady, useSnapshot, useTodayDate, useWrites } from "@/lib/offline/hooks";
import type { TaskEntity } from "@/lib/offline/types";
import { completedList, COMPLETED_LIMIT } from "@/lib/task-views";

export function CompletedTaskList({ timezone, dateFormat }: { timezone: string; dateFormat: string }) {
  return (
    <StoreReady fallback={<div className="flex animate-pulse flex-col gap-2"><div className="h-10 rounded-md bg-muted" /></div>}>
      <Completed timezone={timezone} dateFormat={dateFormat} />
    </StoreReady>
  );
}

function Completed({ timezone, dateFormat }: { timezone: string; dateFormat: string }) {
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const today = useTodayDate();
  const writes = useWrites();
  const completed = useMemo(() => completedList(taskRows, projectRows), [taskRows, projectRows]);
  const groups = useMemo(() => {
    const result: { heading: string; tasks: TaskEntity[] }[] = [];
    for (const task of completed) {
      const day = task.completedAt ? dateInTimezone(new Date(task.completedAt), timezone) : today;
      const heading = pastDateLabel(day, today, dateFormat);
      const group = result.at(-1);
      if (group?.heading === heading) group.tasks.push(task);
      else result.push({ heading, tasks: [task] });
    }
    return result;
  }, [completed, timezone, today, dateFormat]);

  function remove(task: TaskEntity) {
    if (!confirm(`Move task "${task.content}" to Trash? You can restore it later.`)) return;
    writes.tasks.delete(task);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No completed tasks yet.</p>}

        {groups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-muted-foreground">{group.heading}</h2>

            {group.tasks.map((task) => (
              <div key={task.id} className="group flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted sm:flex-nowrap">
                <Button variant="ghost" size="icon-xs" aria-label="Restore task" onClick={() => writes.tasks.reopen(task)}>
                  <CheckCircle2 className="text-green-600" />
                </Button>

                <span className="min-w-0 flex-1 truncate text-base text-muted-foreground line-through sm:text-sm">{task.content}</span>

                <span className="shrink-0 text-xs text-muted-foreground">{projectRows.get(task.projectId)?.name}</span>

                <span className="shrink-0 text-xs text-muted-foreground">
                  {task.completedAt &&
                    new Date(task.completedAt).toLocaleTimeString("en-US", {
                      timeZone: timezone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                </span>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  aria-label="Move task to Trash"
                  onClick={() => remove(task)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {completed.length === COMPLETED_LIMIT && <p className="mt-6 text-xs text-muted-foreground">Showing most recent {COMPLETED_LIMIT}.</p>}
    </>
  );
}
