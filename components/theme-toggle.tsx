"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { applyTheme, getTheme, type Theme } from "@/lib/theme";

const THEME_CHANGE_EVENT = "theme-change";

// Passed to Select so the trigger shows the label rather than the raw value.
const themeLabels: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function getServerTheme(): Theme {
  return "system";
}

export function ThemeToggle() {
  // The server cannot read localStorage, so the first client render must use
  // the same snapshot as SSR. React reads the saved value after hydration.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getTheme,
    getServerTheme,
  );

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
      if (theme === "system") applyTheme(theme);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function changeTheme(next: Theme) {
    localStorage.setItem("theme", next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <Select
      items={themeLabels}
      value={theme}
      onValueChange={(value) => changeTheme(value as Theme)}
    >
      <SelectTrigger className="w-full" aria-label="Theme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(themeLabels).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
