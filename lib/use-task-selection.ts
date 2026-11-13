"use client";

import { useEffect, useEffectEvent, useState } from "react";

// Selection mode, shared by every list that can act on several tasks at once.
// The lists differ in how they reload afterwards, so running the requests is
// here and the reload is the caller's. The Delete key hands the selection to
// `onDeleteKey`, the same as picking Move to Trash on a selected row.
export function useTaskSelection(onDeleteKey?: (ids: string[]) => void) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function exit() {
    setSelecting(false);
    setSelectedIds([]);
  }

  // Callers pass the clicked task first, then anything that travels with it —
  // its subtasks. Ticking a subtask on its own still only affects that one.
  function start(ids: string[]) {
    setSelecting(true);
    setSelectedIds([...new Set(ids)]);
  }

  function toggle(ids: string[]) {
    setSelectedIds((current) =>
      current.includes(ids[0])
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  async function run(
    action: (taskId: string) => Promise<Response>,
    after: () => Promise<unknown> | unknown,
    ids = selectedIds,
  ) {
    if (ids.length === 0) return true;
    let ok = false;
    try {
      // ponytail: per-task fanout, batch endpoint when N gets large.
      const responses = await Promise.all(ids.map(action));
      ok = responses.every((response) => response.ok);
    } finally {
      await after();
      if (ok) exit();
    }
    return ok;
  }

  // Backspace too: it's the key labelled "delete" on a Mac.
  const deleteOnKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      !onDeleteKey ||
      selectedIds.length === 0 ||
      event.repeat ||
      target.isContentEditable ||
      target.closest("input, textarea, select, [role=dialog]")
    ) return;
    event.preventDefault();
    onDeleteKey(selectedIds);
    exit();
  });

  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exit();
      if (event.key === "Delete" || event.key === "Backspace") deleteOnKey(event);
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
