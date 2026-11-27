"use client";

import { useEffect, useState } from "react";

import { isTyping } from "@/lib/keyboard";

type PendingAction = {
  label: string;
  execute: () => Promise<unknown> | void;
  revert: () => void;
  timer: ReturnType<typeof setTimeout>;
};

export type PendingActionState = { label: string };

export class PendingActionController {
  private current: PendingAction | null = null;

  constructor(
    private readonly onPendingChange: (pending: PendingActionState | null) => void,
  ) {}

  schedule(label: string, execute: () => Promise<unknown> | void, revert: () => void) {
    this.flush();
    const action = { label, execute, revert } as PendingAction;
    action.timer = setTimeout(() => {
      if (this.current !== action) return;
      this.current = null;
      this.onPendingChange(null);
      void execute();
    }, 5_000);
    this.current = action;
    this.onPendingChange({ label });
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

export function usePendingAction() {
  const [pending, setPending] = useState<PendingActionState | null>(null);
  const [controller] = useState(() => new PendingActionController(setPending));

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
    undo: controller.undo.bind(controller),
    flush: controller.flush.bind(controller),
  };
}
