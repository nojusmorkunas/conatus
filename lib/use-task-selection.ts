"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { isTyping, taskRows } from "@/lib/keyboard";

// Selection mode, shared by every list that can act on several tasks at once.
// The lists differ in how they reload afterwards, so running the requests is
// here and the reload is the caller's. The Delete key hands the selection to
// `onDeleteKey`, the same as picking Move to Trash on a selected row.
export function useTaskSelection(onDeleteKey?: (ids: string[]) => void) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Where a Shift-click range starts: the task picked last.
  const anchor = useRef<string | null>(null);

  function exit() {
    anchor.current = null;
    setSelecting(false);
    setSelectedIds([]);
  }

  // Callers pass the clicked task first, then anything that travels with it —
  // its subtasks. Ticking a subtask on its own still only affects that one.
  function start(ids: string[]) {
    anchor.current = ids[0];
    setSelecting(true);
    setSelectedIds([...new Set(ids)]);
  }

  function toggle(ids: string[]) {
    anchor.current = ids[0];
    setSelectedIds((current) =>
      current.includes(ids[0])
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  // Shift-click adds every row between the anchor and this one, in screen
  // order, like a file list. `ownIds` keeps it to this list's tasks when a page
  // shows several lists.
  function range(id: string, ownIds: string[]) {
    const own = new Set(ownIds);
    const rows = taskRows().map((row) => row.dataset.taskId!).filter((rowId) => own.has(rowId));
    const from = anchor.current ? rows.indexOf(anchor.current) : -1;
    const to = rows.indexOf(id);
    if (from === -1 || to === -1) {
      if (selecting) toggle([id]);
      else start([id]);
      return;
    }
    const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1);
    setSelecting(true);
    setSelectedIds((current) => [...new Set([...current, ...span])]);
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
      isTyping(target) ||
      target.closest("[role=dialog]")
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

  return { selecting, selectedIds, start, toggle, range, exit, run };
}
