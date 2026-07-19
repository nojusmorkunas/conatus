"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Trash2 } from "lucide-react";

type CompletedTask = {
  id: string;
  content: string;
  priority: number;
  completedAt: Date | null;
  projectName: string;
};

export type CompletedTaskGroup = { heading: string; tasks: CompletedTask[] };

export function CompletedTaskList({
  initialGroups,
  timezone,
}: {
  initialGroups: CompletedTaskGroup[];
  timezone: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [error, setError] = useState<string | null>(null);

  function removeTask(taskId: string) {
    setGroups((current) =>
      current
        .map((group) => ({
          ...group,
          tasks: group.tasks.filter((task) => task.id !== taskId),
        }))
        .filter((group) => group.tasks.length > 0),
    );
  }

  function restoreTask(task: CompletedTask, group: string) {
    setGroups((current) => {
      const withoutTask = current
        .map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== task.id) }))
        .filter((g) => g.tasks.length > 0);
      const existing = withoutTask.find((g) => g.heading === group);
      if (existing) existing.tasks = [task, ...existing.tasks];
      else withoutTask.unshift({ heading: group, tasks: [task] });
      return withoutTask;
    });
  }

  async function restore(task: CompletedTask, group: string) {
    setError(null);
    removeTask(task.id);
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: false }),
    });
    if (!response.ok) {
      setError("Couldn't restore that task. Try again.");
      restoreTask(task, group);
    }
  }

  async function remove(task: CompletedTask) {
    if (!confirm(`Delete task "${task.content}"?`)) return;
    setError(null);
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Couldn't delete that task. Try again.");
      return;
    }
    removeTask(task.id);
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No completed tasks yet.</p>
      )}

      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {group.heading}
          </h2>

          {group.tasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Restore task"
                onClick={() => restore(task, group.heading)}
              >
                <CheckCircle2 className="text-green-600" />
              </Button>

              <span className="flex-1 truncate text-sm text-muted-foreground line-through">
                {task.content}
              </span>

              <span className="shrink-0 text-xs text-muted-foreground">
                {task.projectName}
              </span>

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
                className="opacity-0 group-hover:opacity-100"
                aria-label="Delete task"
                onClick={() => remove(task)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ))}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
