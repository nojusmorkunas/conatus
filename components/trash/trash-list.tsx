"use client";

import { useState } from "react";
import { Folder, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type DeletedProject = { id: string; name: string; deletedAt: Date | null };
type DeletedTask = { id: string; content: string; projectName: string; deletedAt: Date | null };

export function TrashList({
  initialProjects,
  initialTasks,
}: {
  initialProjects: DeletedProject[];
  initialTasks: DeletedTask[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(kind: "projects" | "tasks", id: string) {
    setError(null);
    setRestoring(`${kind}:${id}`);
    const response = await fetch(`/api/trash/${kind}/${id}/restore`, { method: "POST" });
    setRestoring(null);
    if (!response.ok) {
      setError("Couldn’t restore that item. Try again.");
      return;
    }
    if (kind === "projects") setProjects((current) => current.filter((item) => item.id !== id));
    else setTasks((current) => current.filter((item) => item.id !== id));
    window.dispatchEvent(new Event("sidebar:projects:refresh"));
  }

  if (!projects.length && !tasks.length) {
    return <p className="text-sm text-muted-foreground">Trash is empty.</p>;
  }

  return (
    <div className="space-y-8">
      {projects.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Projects</h2>
          <div className="divide-y rounded-lg border">
            {projects.map((project) => (
              <div key={project.id} className="flex items-center gap-3 p-3">
                <Folder className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                <Button size="sm" variant="outline" disabled={restoring === `projects:${project.id}`} onClick={() => void restore("projects", project.id)}>
                  <RotateCcw /> Restore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {tasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Tasks</h2>
          <div className="divide-y rounded-lg border">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{task.content}</span>
                  <span className="block truncate text-xs text-muted-foreground">{task.projectName}</span>
                </span>
                <Button size="sm" variant="outline" disabled={restoring === `tasks:${task.id}`} onClick={() => void restore("tasks", task.id)}>
                  <RotateCcw /> Restore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
