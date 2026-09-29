"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import { jsonInit } from "@/lib/api-client";
import { completedForSection } from "@/lib/completed-tasks";
import { dateInTimezone, pastDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import type { TaskWithLabels } from "./types";

type CompletedTasksPage = {
  items: TaskWithLabels[];
  nextCursor: string | null;
};

export type CompletedHistory = {
  items: TaskWithLabels[];
  cursors: Record<string, string | null>;
  load: (sectionId: string | null) => Promise<void>;
  loadMore: (sectionId: string | null) => Promise<void>;
  add: (task: TaskWithLabels) => void;
  remove: (id: string) => void;
  restore: (
    task: TaskWithLabels,
    setTasks: Dispatch<SetStateAction<TaskWithLabels[]>>,
  ) => Promise<boolean>;
  find: (id: string) => TaskWithLabels | undefined;
};

function sectionKey(sectionId: string | null) {
  return sectionId ?? "none";
}

function upsert(tasks: TaskWithLabels[], task: TaskWithLabels) {
  const existing = tasks.findIndex((item) => item.id === task.id);
  if (existing === -1) return [...tasks, task];
  return tasks.map((item, index) => (index === existing ? task : item));
}

export function useCompletedHistory(
  projectId: string,
  onError: () => void,
): CompletedHistory {
  const [items, setItems] = useState<TaskWithLabels[]>([]);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const cursorsRef = useRef(cursors);
  const inFlight = useRef(new Set<string>());
  const removedIds = useRef(new Set<string>());
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadPage = useCallback(
    async (sectionId: string | null, cursor: string | null) => {
      const key = sectionKey(sectionId);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);

      try {
        const params = new URLSearchParams({ sectionId: sectionId ?? "" });
        if (cursor !== null) params.set("cursor", cursor);
        const response = await fetch(
          `/api/projects/${projectId}/completed-tasks?${params.toString()}`,
        );
        if (!response.ok) throw new Error("Couldn't load completed tasks");

        const page = (await response.json()) as CompletedTasksPage;
        setItems((current) => {
          const merged = new Map(current.map((task) => [task.id, task]));
          for (const task of page.items) {
            if (!removedIds.current.has(task.id)) merged.set(task.id, task);
          }
          return [...merged.values()];
        });
        const nextCursors = {
          ...cursorsRef.current,
          [key]: page.nextCursor,
        };
        cursorsRef.current = nextCursors;
        setCursors(nextCursors);
      } catch {
        onErrorRef.current();
      } finally {
        inFlight.current.delete(key);
      }
    },
    [projectId],
  );

  const load = useCallback(
    async (sectionId: string | null) => {
      const key = sectionKey(sectionId);
      if (Object.hasOwn(cursorsRef.current, key)) return;
      await loadPage(sectionId, null);
    },
    [loadPage],
  );

  const loadMore = useCallback(
    async (sectionId: string | null) => {
      const cursor = cursorsRef.current[sectionKey(sectionId)];
      if (typeof cursor !== "string") return;
      await loadPage(sectionId, cursor);
    },
    [loadPage],
  );

  const add = useCallback((task: TaskWithLabels) => {
    removedIds.current.delete(task.id);
    setItems((current) => upsert(current, task));
  }, []);

  const remove = useCallback((id: string) => {
    removedIds.current.add(id);
    setItems((current) => current.filter((task) => task.id !== id));
  }, []);

  const restore = useCallback(
    async (
      task: TaskWithLabels,
      setTasks: Dispatch<SetStateAction<TaskWithLabels[]>>,
    ) => {
      remove(task.id);
      setTasks((current) =>
        upsert(current, { ...task, isCompleted: false, completedAt: null }),
      );

      try {
        const response = await fetch(
          `/api/tasks/${task.id}`,
          jsonInit("PATCH", { completed: false }),
        );
        if (!response.ok) throw new Error("Couldn't restore completed task");
        return true;
      } catch {
        add(task);
        return false;
      }
    },
    [add, remove],
  );

  const find = useCallback(
    (id: string) => items.find((task) => task.id === id),
    [items],
  );

  return useMemo(
    () => ({ items, cursors, load, loadMore, add, remove, restore, find }),
    [items, cursors, load, loadMore, add, remove, restore, find],
  );
}

export function CompletedTasks({
  sectionId,
  stateTasks,
  history,
  today,
  dateFormat,
  timezone,
  onRestore,
  onOpen,
  indented = false,
}: {
  sectionId: string | null;
  stateTasks: TaskWithLabels[];
  history: CompletedHistory;
  today: string;
  dateFormat: string;
  timezone: string;
  onRestore: (task: TaskWithLabels) => void | Promise<void>;
  onOpen?: (task: TaskWithLabels) => void;
  // Line the rows up with the list's task rows, which reserve a drag-handle gutter.
  indented?: boolean;
}) {
  const { load } = history;

  // ponytail: This makes one request per section on first show. If projects
  // with dozens of sections get slow, use one query that returns the first
  // page of every section.
  useEffect(() => {
    void load(sectionId);
  }, [load, sectionId]);

  const rows = completedForSection(sectionId, stateTasks, history.items);
  const cursor = history.cursors[sectionKey(sectionId)];
  // Restoring every loaded row still leaves older pages to reach.
  if (rows.length === 0 && typeof cursor !== "string") return null;

  return (
    <div className={cn("flex flex-col gap-1", indented && "pl-[var(--task-card-inset)]")}>
      {rows.map((task) => {
        const contentClassName =
          "min-w-0 flex-1 truncate text-left text-base text-muted-foreground line-through sm:text-sm";
        const completionLabel = task.completedAt
          ? pastDateLabel(
              dateInTimezone(new Date(task.completedAt), timezone),
              today,
              dateFormat,
            )
          : null;

        return (
          <div
            key={task.id}
            className={cn(
              "group flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted sm:flex-nowrap",
              indented && "pl-[calc(var(--task-indent-base)-var(--task-card-inset))]",
            )}
          >
            <TaskCheckbox
              checked
              priority={task.priority}
              onToggle={() => onRestore(task)}
            />

            {onOpen ? (
              <button
                type="button"
                className={contentClassName}
                onClick={() => onOpen(task)}
              >
                {task.content}
              </button>
            ) : (
              <span className={contentClassName}>{task.content}</span>
            )}

            {completionLabel && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {completionLabel}
              </span>
            )}
          </div>
        );
      })}

      {typeof cursor === "string" && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn("self-start text-muted-foreground", indented && "ml-2")}
          onClick={() => void history.loadMore(sectionId)}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
