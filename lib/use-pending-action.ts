"use client";

import { useEffect, useState } from "react";

import { isTyping } from "@/lib/keyboard";

type PendingAction<T> = {
  label: string;
  execute: () => Promise<unknown> | void;
  revert: () => void;
  apply?: (data: T) => T;
  timer: ReturnType<typeof setTimeout>;
};

export type PendingActionState = { label: string };

export class PendingActionController<T = unknown> {
  private current: PendingAction<T> | null = null;

  constructor(
    private readonly onPendingChange: (pending: PendingActionState | null) => void,
  ) {}

  // `apply` is the optimistic change itself. Until the action is sent, the
  // server still has the old state, so any data fetched in the meantime goes
  // through `reapply` to keep the change on screen.
  schedule(
    label: string,
    execute: () => Promise<unknown> | void,
    revert: () => void,
    apply?: (data: T) => T,
  ) {
    this.flush();
    const action = { label, execute, revert, apply } as PendingAction<T>;
    action.timer = setTimeout(() => {
      if (this.current !== action) return;
      this.current = null;
      this.onPendingChange(null);
      void execute();
    }, 5_000);
    this.current = action;
    this.onPendingChange({ label });
  }

  reapply(data: T) {
    return this.current?.apply ? this.current.apply(data) : data;
  }

  undo() {
    const action = this.current;
    if (!action) return;
    clearTimeout(action.timer);
    action.revert();
    this.current = null;
    this.onPendingChange(null);
  }

  flush() {
    const action = this.current;
    if (!action) return;
    clearTimeout(action.timer);
    this.current = null;
    this.onPendingChange(null);
    void action.execute();
  }
}

export function usePendingAction<T = unknown>() {
  const [pending, setPending] = useState<PendingActionState | null>(null);
  const [controller] = useState(() => new PendingActionController<T>(setPending));

  useEffect(() => () => controller.flush(), [controller]);

  // Ctrl/Cmd+Z does what the toast's Undo button does while it shows. Fields
  // keep their own undo.
  // ponytail: two lists with a toast each both undo, a page-wide stack if that bites.
  useEffect(() => {
    if (!pending) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z" || isTyping(event.target)) return;
      if ((event.target as Element).closest?.("[role=dialog]")) return;
      event.preventDefault();
      controller.undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, controller]);

  return {
    pending,
    schedule: controller.schedule.bind(controller),
    reapply: controller.reapply.bind(controller),
    undo: controller.undo.bind(controller),
    flush: controller.flush.bind(controller),
  };
}
