"use client";

import { useEffect, useState } from "react";

// Selection mode, shared by every list that can act on several tasks at once.
// The lists differ in how they reload afterwards, so running the requests is
// here and the reload is the caller's.
export function useTaskSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function exit() {
    setSelecting(false);
    setSelectedIds([]);
  }

  function start(taskId: string) {
    setSelecting(true);
    setSelectedIds([taskId]);
  }

  function toggle(taskId: string) {
    setSelectedIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  }

  async function run(
    action: (taskId: string) => Promise<Response>,
    after: () => Promise<unknown> | unknown,
  ) {
    if (selectedIds.length === 0) return true;
    let ok = false;
    try {
      // ponytail: per-task fanout, batch endpoint when N gets large.
      const responses = await Promise.all(selectedIds.map(action));
      ok = responses.every((response) => response.ok);
    } finally {
      await after();
      if (ok) exit();
    }
    return ok;
  }

  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting]);

  // A press on empty page space — the gutter beside the list, the margin under
  // it — means "never mind". Rows, menus, dialogs, the sidebar and any real
  // control keep their own click.
  useEffect(() => {
    if (!selecting) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (
        target?.closest?.(
          "[data-task-id], [data-slot=dropdown-menu-content], [role=dialog], .project-sidebar, button, input, a, textarea, select",
        )
      ) return;
      exit();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selecting]);

  useEffect(() => {
    function onToggleSelectMode() {
      if (selecting) {
        exit();
        return;
      }
      setSelecting(true);
    }
    window.addEventListener("task-select:toggle", onToggleSelectMode);
    return () => window.removeEventListener("task-select:toggle", onToggleSelectMode);
  }, [selecting]);

  return { selecting, selectedIds, start, toggle, exit, run };
}
