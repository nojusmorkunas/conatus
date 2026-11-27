"use client";

import { useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { OfflineContext } from "@/components/offline/offline-provider";

import type { TaskWithLabels } from "@/components/tasks/types";
import { EmptyState } from "@/components/ui/empty-state";
import { openCounts, projectTasks, visibleProjects } from "@/lib/task-views";

import { OfflineStore, type Snapshot } from "./store";
import { byOrder } from "./support";
import type { SyncState } from "./sync";
import { isLocalId } from "./types";
import { taskView } from "./view";

export function useOffline() {
  const holder = useContext(OfflineContext);
  if (!holder) throw new Error("useOffline needs the OfflineProvider above it.");
  return useSyncExternalStore(holder.subscribe, holder.get, () => holder.initial);
}

// What the server renders, and what the first client render must match: nothing loaded.
const empty = new OfflineStore().getSnapshot();
const idle: SyncState = { status: "idle" };

/** [selector] must return the same reference while what it reads is unchanged, or the view re-renders forever. */
export function useSnapshot<T>(selector: (snapshot: Snapshot) => T): T {
  const { store } = useOffline();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(empty));
}

export const useWrites = () => useOffline().writes;

/** "YYYY-MM-DD" in the user's time zone, which changes when midnight passes. */
export const useTodayDate = () => useOffline().today;

export function useSyncState(): SyncState {
  const { repo } = useOffline();
  return useSyncExternalStore(repo.subscribe, repo.getState, () => idle);
}

/** The server's id for something made here once it has one. */
export function useRenamed(id: string): string | undefined {
  const { store, outbox } = useOffline();
  return useSyncExternalStore(store.subscribe, () => outbox.renamedTo(id), () => undefined);
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser thinks it has a network. The server and the first render say yes. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** A project's tasks as its page shows them, its sections and all labels, each the same array until what it reads changes. */
export function useProjectLists(projectId: string, includeTaskId?: string | null) {
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const labelRows = useSnapshot((snapshot) => snapshot.labels);
  const sectionRows = useSnapshot((snapshot) => snapshot.sections);
  const labels = useMemo(() => [...labelRows.values()].sort(byOrder), [labelRows]);
  const sections = useMemo(() => [...sectionRows.values()].filter((section) => section.projectId === projectId && !section.isArchived).sort(byOrder), [sectionRows, projectId]);
  const tasks = useMemo<TaskWithLabels[]>(() => projectTasks(taskRows, projectId, includeTaskId).map((task) => taskView(task, { labels: labelRows })), [taskRows, labelRows, projectId, includeTaskId]);
  // The completed tasks the list shows under "completed", which the page rule leaves out.
  const completedRoots = useMemo<TaskWithLabels[]>(
    () => [...taskRows.values()].filter((task) => task.projectId === projectId && task.deletedAt === null && task.isCompleted && task.parentId === null).map((task) => taskView(task, { labels: labelRows })),
    [taskRows, labelRows, projectId],
  );
  return { tasks, completedRoots, labels, sections };
}

/** What the sidebar lists: visible projects, all labels and filters, and the open-task counts, each the same value until what it reads changes. */
export function useSidebarLists() {
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const labelRows = useSnapshot((snapshot) => snapshot.labels);
  const filterRows = useSnapshot((snapshot) => snapshot.filters);
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const today = useTodayDate();
  const projects = useMemo(() => visibleProjects(projectRows.values()), [projectRows]);
  const labels = useMemo(() => [...labelRows.values()].sort(byOrder), [labelRows]);
  const filters = useMemo(() => [...filterRows.values()].sort(byOrder), [filterRows]);
  const counts = useMemo(() => openCounts(taskRows.values(), projectRows, today), [taskRows, projectRows, today]);
  return { projects, labels, filters, counts };
}

/**
 * Fetches the notes of [scope] when it opens and whenever the connection comes back, for the
 * store to hold. [loaded] says its comments are all here: fetched, or made here and never sent.
 */
function useNotesRefresh(scope: { taskId: string } | { projectId: string }) {
  const { repo } = useOffline();
  const online = useOnline();
  const [done, setDone] = useState<string | null>(null);
  const [key, id] = Object.entries(scope)[0];
  useEffect(() => {
    if (!online || isLocalId(id)) return;
    let current = true;
    void repo.refreshNotes(key === "taskId" ? { taskId: id } : { projectId: id }).then((ok) => current && ok && setDone(id));
    return () => {
      current = false;
    };
  }, [repo, online, key, id]);
  return isLocalId(id) || done === id;
}

/** A task's comments and reminders, read from the store, which refreshes them while the connection is up. */
export function useTaskDetails(taskId: string) {
  const commentRows = useSnapshot((snapshot) => snapshot.comments);
  const reminderRows = useSnapshot((snapshot) => snapshot.reminders);
  const loaded = useNotesRefresh({ taskId });
  const comments = useMemo(() => [...commentRows.values()].filter((comment) => comment.taskId === taskId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)), [commentRows, taskId]);
  const reminders = useMemo(() => [...reminderRows.values()].filter((reminder) => reminder.taskId === taskId).sort((a, b) => (a.remindAt < b.remindAt ? -1 : a.remindAt > b.remindAt ? 1 : 0)), [reminderRows, taskId]);
  return { comments, reminders, loaded };
}

/** A project's comments, the same way. */
export function useProjectComments(projectId: string) {
  const commentRows = useSnapshot((snapshot) => snapshot.comments);
  const loaded = useNotesRefresh({ projectId });
  const comments = useMemo(() => [...commentRows.values()].filter((comment) => comment.projectId === projectId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)), [commentRows, projectId]);
  return { comments, loaded };
}

/** What needs the user's say: conflicts to settle and changes the server rejected. */
export function useDecisions() {
  const conflicts = useSnapshot((snapshot) => snapshot.conflicts);
  const changes = useSnapshot((snapshot) => snapshot.changes);
  return useMemo(
    () => ({
      conflicts: [...conflicts.values()],
      failedChanges: [...changes.values()].filter((change) => change.failure !== null).sort((a, b) => a.seq - b.seq),
    }),
    [conflicts, changes],
  );
}

/**
 * Renders [children] once the store has opened and finished its first sync; [fallback] until then,
 * and on the server. Offline there is no first sync to wait for, so it says so instead.
 */
export function StoreReady({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  const { status } = useOffline();
  const synced = useSnapshot((snapshot) => snapshot.meta.lastSyncAt !== null);
  const online = useOnline();
  if (status === "loading") return fallback;
  if (synced) return children;
  return online ? fallback : <EmptyState icon={Plus} title="Nothing to show yet" description="Your tasks will appear once this device has connected once." />;
}
