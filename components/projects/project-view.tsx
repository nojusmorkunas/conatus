"use client";

import { useEffect, useEffectEvent, useMemo, useSyncExternalStore } from "react";

import { Board } from "@/components/board/board";
import { TaskList } from "@/components/tasks/task-list";
import { keyName, shortcutsBlocked } from "@/lib/keyboard";
import { useTodayDate } from "@/lib/offline/hooks";
import type { ProjectEntity } from "@/lib/offline/types";
import type { SortBy } from "@/lib/task-sort";
import { ProjectHeader } from "./project-header";

// Sort keys. Pressing the current one again goes back to manual order.
const SORT_KEYS: Record<string, SortBy> = { d: "due", p: "priority", n: "name" };

// Layout, sort and show-completed are saved per project in localStorage, which
// the server can't read. It renders the defaults, hydration matches them, and
// the saved value takes over right after.
function subscribePreferences(callback: () => void) {
  window.addEventListener("project-preference", callback);
  return () => window.removeEventListener("project-preference", callback);
}

function useStoredPreference(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribePreferences,
    () => localStorage.getItem(key) ?? fallback,
    () => fallback,
  );
}

function storePreference(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event("project-preference"));
}

export function ProjectView({
  project,
  role,
  members,
  currentUserId,
  projectCommentCount,
  dateFormat,
  timezone,
}: {
  project: ProjectEntity;
  role: "owner" | "editor";
  members: { userId: string; username: string; role: "owner" | "editor" }[];
  currentUserId: string;
  projectCommentCount: number;
  dateFormat: string;
  timezone: string;
}) {
  const view = useStoredPreference(`project-view:${project.id}`, "list") === "board" ? "board" : "list";
  const storedSort = useStoredPreference(`sort:${project.id}`, "manual");
  const sortBy: SortBy = storedSort === "due" || storedSort === "priority" || storedSort === "name"
    ? storedSort
    : "manual";
  const showCompleted = useStoredPreference(`show-completed:${project.id}`, "false") === "true";
  const today = useTodayDate();
  const taskMembers = useMemo(() => members.map(({ userId: id, username }) => ({ id, username })), [members]);

  function switchView(next: "list" | "board") {
    storePreference(`project-view:${project.id}`, next);
  }

  function changeSort(next: SortBy) {
    storePreference(`sort:${project.id}`, next);
  }

  function changeShowCompleted(next: boolean) {
    storePreference(`show-completed:${project.id}`, String(next));
  }

  // Shift+V switches layout.
  const onProjectKey = useEffectEvent((event: KeyboardEvent) => {
    if (shortcutsBlocked(event)) return;
    const key = keyName(event);
    const sort = SORT_KEYS[key];
    if (key === "Shift+v") switchView(view === "list" ? "board" : "list");
    else if (sort) changeSort(sortBy === sort ? "manual" : sort);
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      onProjectKey(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-10 sm:px-6 md:px-8 lg:pl-10">
      <ProjectHeader
        project={project}
        role={role}
        members={members}
        currentUserId={currentUserId}
        projectCommentCount={projectCommentCount}
        view={view}
        sortBy={sortBy}
        showCompleted={showCompleted}
        onViewChange={switchView}
        onSortChange={changeSort}
        onShowCompletedChange={changeShowCompleted}
      />

      {view === "list" ? (
        <TaskList
          projectId={project.id}
          members={taskMembers}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          timezone={timezone}
          sortBy={sortBy}
          showCompleted={showCompleted}
        />
      ) : (
        <Board
          projectId={project.id}
          members={taskMembers}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          timezone={timezone}
          showCompleted={showCompleted}
        />
      )}
    </div>
  );
}
