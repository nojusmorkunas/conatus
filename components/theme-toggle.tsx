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
    <Select value={theme} onValueChange={(value) => changeTheme(value as Theme)}>
      <SelectTrigger className="w-full" aria-label="Theme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="system">System</SelectItem>
      </SelectContent>
    </Select>
  );
}
