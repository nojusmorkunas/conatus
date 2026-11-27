"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { discardOfflineTask, readOfflineTasks, setOfflineUser, syncOfflineTasks, type OfflineTask } from "@/lib/offline-tasks";

export function OfflineTasks({ userId, inboxProjectId }: { userId: string; inboxProjectId: string | null }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<OfflineTask[]>([]);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const hasPending = tasks.some((task) => task.status === "pending");

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { synced, movedToInbox } = await syncOfflineTasks(inboxProjectId);
      if (synced > 0) router.refresh();
      for (const content of movedToInbox) toastManager.add({ title: `"${content}" was added to Inbox because its project is no longer available.` });
    } finally {
      setSyncing(false);
    }
  }, [inboxProjectId, router]);

  useEffect(() => {
    setOfflineUser(userId);
    const read = () => setTasks(readOfflineTasks());
    const goOnline = () => { setOffline(false); void sync(); };
    const goOffline = () => setOffline(true);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    read();
    window.addEventListener("offline-tasks:change", read);
    window.addEventListener("storage", read);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    // Deferred one tick so the mount effect doesn't set state synchronously.
    const start = window.setTimeout(() => void sync(), 0);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("offline-tasks:change", read);
      window.removeEventListener("storage", read);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, sync]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void sync(), 30_000);
    return () => window.clearInterval(timer);
  }, [hasPending, sync]);

  if (!tasks.length) return null;

  function discard(task: OfflineTask) {
    if (window.confirm("Discard this task? It was never saved.")) discardOfflineTask(task.key);
  }

  return (
    <section role="region" aria-label="Unsynced tasks" className="mx-auto w-full max-w-4xl px-3 pt-6 sm:px-6">
      <div className="rounded-xl border border-dashed border-amber-500/60 bg-amber-50/60 p-3 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">{tasks.length} {tasks.length === 1 ? "task" : "tasks"} not synced yet</h2>
            <p aria-live="polite" className="text-xs text-muted-foreground">{offline ? "You're offline. They'll sync when you reconnect." : "Waiting to sync."}</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void sync()}>Sync now</Button>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {tasks.map((task) => (
            <li key={task.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{task.content}</span>
              {task.projectName && <span className="shrink-0 text-xs text-muted-foreground">{task.projectName}</span>}
              {task.status === "failed" ? (
                <>
                  <span className="text-xs text-destructive">Failed: {task.error}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => discard(task)}>Discard</Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Not synced</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
