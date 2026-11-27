"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { serverWritten } from "@/lib/api-client";
import { StoreReady, useSnapshot, useWrites } from "@/lib/offline/hooks";
import { trashItems } from "@/lib/task-views";

type ServerProject = { id: string; name: string; deletedAt: string };

export function TrashList({ serverProjects }: { serverProjects: ServerProject[] }) {
  return (
    <StoreReady fallback={<div className="flex animate-pulse flex-col gap-2"><div className="h-10 rounded-md bg-muted" /></div>}>
      <Trash serverProjects={serverProjects} />
    </StoreReady>
  );
}

function Trash({ serverProjects }: { serverProjects: ServerProject[] }) {
  const router = useRouter();
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const writes = useWrites();
  const [error, setError] = useState<string | null>(null);
  const trash = useMemo(() => trashItems(taskRows, projectRows), [taskRows, projectRows]);
  // A project the local copy holds is shown from there; the rest come from the server page.
  const projects = useMemo(
    () =>
      [
        ...trash.projects.map((project) => ({ id: project.id, name: project.name, deletedAt: project.deletedAt ?? "" })),
        ...serverProjects.filter((project) => !projectRows.has(project.id)),
      ].sort((a, b) => (Date.parse(b.deletedAt) || 0) - (Date.parse(a.deletedAt) || 0)),
    [trash.projects, serverProjects, projectRows],
  );

  function restoreProject(id: string) {
    setError(null);
    const project = projectRows.get(id);
    if (project) return writes.lists.restoreProject(project);
    // Not on this device yet, so only the server can bring it back.
    void fetch(`/api/trash/projects/${id}/restore`, { method: "POST" }).then((response) => {
      if (!response.ok) return setError("Couldn’t restore that item. Try again.");
      serverWritten();
      router.refresh();
    }, () => setError("Couldn’t restore that item. Try again."));
  }

  if (!projects.length && !trash.tasks.length) {
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
                <Button size="sm" variant="outline" onClick={() => restoreProject(project.id)}>
                  <RotateCcw /> Restore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {trash.tasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Tasks</h2>
          <div className="divide-y rounded-lg border">
            {trash.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{task.content}</span>
                  <span className="block truncate text-xs text-muted-foreground">{projectRows.get(task.projectId)?.name}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => writes.tasks.restore(task)}>
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
