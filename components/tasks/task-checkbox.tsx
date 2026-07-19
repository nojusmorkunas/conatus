"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { priorityColors, priorityFill } from "./priority";

export function TaskCheckbox({
  priority,
  checked,
  onToggle,
}: {
  priority: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={checked ? "Mark incomplete" : "Mark complete"}
      onClick={onToggle}
      className={cn(
        "group/checkbox mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-all hover:scale-[1.04]",
        checked
          ? priorityFill[priority]
          : priorityColors[priority],
      )}
    >
      <Check
        className={cn(
          "size-3.5",
          checked
            ? "text-white"
            : "opacity-0 transition-opacity group-hover/checkbox:opacity-30",
        )}
      />
    </button>
  );
}
