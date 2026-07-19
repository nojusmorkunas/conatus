"use client";

import { useEffect } from "react";

import { applyTheme, getTheme } from "@/lib/theme";

// Streamed routes replace the SSR shell after the <head> boot script has run,
// wiping the theme class off <html>; re-apply it once hydration settles.
export function ThemeGuard() {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return null;
}
