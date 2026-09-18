"use client";

import { useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPLETION_SOUND_EVENT,
  completionSoundEnabled,
  playCompletionSound,
  setCompletionSoundEnabled,
} from "@/lib/completion-sound";

const soundLabels = { on: "On", off: "Off" };

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(COMPLETION_SOUND_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(COMPLETION_SOUND_EVENT, onStoreChange);
  };
}

export function CompletionSoundToggle() {
  // Matches ThemeToggle: the server cannot read localStorage, so the first
  // client render uses the same snapshot as SSR and settles after hydration.
  const value = useSyncExternalStore(
    subscribe,
    () => (completionSoundEnabled() ? "on" : "off"),
    () => "on",
  );

  return (
    <Select
      items={soundLabels}
      value={value}
      onValueChange={(next) => {
        setCompletionSoundEnabled(next === "on");
        // Hearing it is the point; play a sample when switching it on.
        if (next === "on") playCompletionSound();
      }}
    >
      <SelectTrigger className="w-full" aria-label="Completion sound">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(soundLabels).map(([option, label]) => (
          <SelectItem key={option} value={option}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
