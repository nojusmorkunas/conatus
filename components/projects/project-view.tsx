"use client";

import { useState } from "react";

import type {
  labels as labelsTable,
  projects,
  sections as sectionsTable,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Board } from "@/components/board/board";
import { TaskList, type TaskWithLabels } from "@/components/tasks/task-list";
import type { SortBy } from "@/lib/task-sort";
import { ProjectHeader } from "./project-header";

type Project = typeof projects.$inferSelect;
type Section = typeof sectionsTable.$inferSelect;
type Label = typeof labelsTable.$inferSelect;

export function ProjectView({
  project,
  role,
  members,
  currentUserId,
  projectCommentCount,
  sections,
  tasks,
  labels,
  today,
  dateFormat,
  initialDetailTaskId,
}: {
  project: Project;
  role: "owner" | "editor";
  members: { userId: string; email: string; role: "owner" | "editor" }[];
  currentUserId: string;
  projectCommentCount: number;
  sections: Section[];
  tasks: TaskWithLabels[];
  labels: Label[];
  today: string;
  dateFormat: string;
  initialDetailTaskId?: string;
}) {
  // Lazy initializer only runs on the client during hydration, so this
  // reads localStorage without an SSR/client mismatch or a post-mount effect.
  const [view, setView] = useState<"list" | "board">(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(`project-view:${project.id}`) === "board"
      ? "board"
      : "list",
  );
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    if (typeof window === "undefined") return "manual";
    const stored = localStorage.getItem(`sort:${project.id}`);
    return stored === "due" || stored === "priority" || stored === "name"
      ? stored
      : "manual";
  });
  const [openTaskCount, setOpenTaskCount] = useState(
    () => tasks.filter((task) => !task.isCompleted).length,
  );
  const taskMembers = members.map(({ userId: id, email }) => ({ id, email }));

  function switchView(next: "list" | "board") {
    setView(next);
    localStorage.setItem(`project-view:${project.id}`, next);
  }

  function changeSort(next: SortBy) {
    setSortBy(next);
    localStorage.setItem(`sort:${project.id}`, next);
  }

  return (
    <div
      className={cn(
        "w-full px-6 pt-3 pb-10 md:px-8 lg:pl-10",
        view === "list" && "max-w-4xl",
      )}
    >
      <ProjectHeader
        project={project}
        role={role}
        members={members}
        currentUserId={currentUserId}
        projectCommentCount={projectCommentCount}
        openTaskCount={openTaskCount}
        sectionCount={sections.length}
        view={view}
        sortBy={sortBy}
        onViewChange={switchView}
        onSortChange={changeSort}
      />

      {view === "list" ? (
        <TaskList
          projectId={project.id}
          sections={sections}
          initialTasks={tasks}
          labels={labels}
          members={taskMembers}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          sortBy={sortBy}
          initialDetailTaskId={initialDetailTaskId}
          onOpenCountChange={setOpenTaskCount}
        />
      ) : (
        <Board
          projectId={project.id}
          sections={sections}
          initialTasks={tasks}
          labels={labels}
          members={taskMembers}
          currentUserId={currentUserId}
          today={today}
          dateFormat={dateFormat}
          onOpenCountChange={setOpenTaskCount}
        />
      )}
    </div>
  );
}
