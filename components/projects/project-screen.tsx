"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileSidebarTrigger } from "@/components/projects/mobile-sidebar-trigger";
import { ProjectView } from "@/components/projects/project-view";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { StoreReady, useOffline, useRenamed, useSnapshot } from "@/lib/offline/hooks";
import { isVisibleProject } from "@/lib/task-views";
import { useRouteId } from "@/lib/use-route-id";

type Member = { userId: string; username: string; role: "owner" | "editor" };

function ProjectSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse p-6">
      <div className="mb-6 h-7 w-40 rounded bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-10 rounded-md bg-muted" />
        <div className="h-10 rounded-md bg-muted" />
      </div>
    </div>
  );
}

/** A project page that reads everything from the local copy, so it opens offline and for projects that only exist here. */
export function ProjectScreen(props: ScreenProps) {
  return (
    <StoreReady fallback={<ProjectSkeleton />}>
      <Screen {...props} />
    </StoreReady>
  );
}

type ArchivedProject = { id: string; name: string; tasks: { id: string; content: string }[] };

// What the server read for the project the page was rendered for, which isn't this one when the page came from the cache.
type ScreenProps = {
  serverProjectId: string;
  role: "owner" | "editor";
  members: Member[];
  currentUserId: string;
  projectCommentCount: number;
  archived: ArchivedProject | null;
  dateFormat: string;
  timezone: string;
};

function Screen({ serverProjectId, archived, role, members, projectCommentCount, ...rest }: ScreenProps) {
  const id = useRouteId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task") ?? "";
  // Something made here gets the server's id once it has synced, and the address follows.
  const projectRenamed = useRenamed(id);
  const taskRenamed = useRenamed(taskParam);
  const projectId = projectRenamed ?? id;
  const taskId = taskRenamed ?? taskParam;
  const project = useSnapshot((snapshot) => snapshot.projects.get(projectId));

  useEffect(() => {
    if (!projectRenamed && !taskRenamed) return;
    router.replace(`/projects/${encodeURIComponent(projectId)}${taskId ? `?task=${encodeURIComponent(taskId)}` : ""}`);
  }, [router, projectRenamed, taskRenamed, projectId, taskId]);

  const fromServer = serverProjectId === id;
  if (!project && archived?.id === projectId) return <ArchivedView archived={archived} />;
  if (!project || !isVisibleProject(project)) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 p-6">
        <MobileSidebarTrigger />
        <p className="text-sm text-muted-foreground">This project doesn&apos;t exist, or you can&apos;t reach it.</p>
        <Link href="/today" className="text-sm underline underline-offset-2">Go to Today</Link>
      </div>
    );
  }

  return (
    <ProjectView
      key={project.id}
      project={project}
      {...rest}
      role={fromServer ? role : "owner"}
      members={fromServer ? members : []}
      projectCommentCount={fromServer ? projectCommentCount : 0}
    />
  );
}

// Unarchiving puts the project in the next sync, which swaps this for the normal page.
function ArchivedView({ archived }: { archived: ArchivedProject }) {
  const { repo } = useOffline();
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <MobileSidebarTrigger />
      <h1 className="text-2xl font-bold">{archived.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">This project is archived.</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={() => void api.patch(`/api/projects/${archived.id}`, { isArchived: false }).then(() => repo.sync())}>
        Unarchive
      </Button>
      <ul className="mt-6 flex flex-col gap-1 text-sm">
        {archived.tasks.map((task) => <li key={task.id}>{task.content}</li>)}
      </ul>
    </div>
  );
}
