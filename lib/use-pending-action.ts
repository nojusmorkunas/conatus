"use client";

import { useEffect, useState } from "react";

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

  schedule(
    label: string,
    execute: () => Promise<unknown> | void,
    revert: () => void,
  ) {
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

  return {
    pending,
    schedule: controller.schedule.bind(controller),
    undo: controller.undo.bind(controller),
    flush: controller.flush.bind(controller),
  };
}
