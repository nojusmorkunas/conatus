"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { priorityColors, priorityFill } from "./priority";

export function TaskCheckbox({
  priority,
  checked,
  onToggle,
  celebrating = false,
}: {
  priority: number;
  checked: boolean;
  onToggle: () => void;
  celebrating?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={checked ? "Mark incomplete" : "Mark complete"}
      onClick={onToggle}
      className={cn(
        "group/checkbox relative mt-0.5 flex size-5 shrink-0 self-start items-center justify-center rounded-[6px] border-2 transition-all after:absolute after:-inset-3 hover:scale-[1.04] sm:mt-0",
        celebrating && "task-checkbox-completing",
        checked
          ? priorityFill[priority]
          : priorityColors[priority],
      )}
    >
      {celebrating && (
        <span
          aria-hidden
          className="task-checkbox-ring pointer-events-none absolute -inset-1.5 rounded-[9px] border border-current"
        />
      )}
      <Check
        className={cn(
          "size-3.5",
          celebrating && "task-checkbox-check",
          checked
            ? "text-white"
            : "opacity-0 transition-opacity group-hover/checkbox:opacity-30",
        )}
      />
    </button>
  );
}
