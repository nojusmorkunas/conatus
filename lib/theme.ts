export type Theme = "light" | "dark" | "system";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const theme = localStorage.getItem("theme");
  return theme === "light" || theme === "dark" || theme === "system"
    ? theme
    : "system";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" ||
      (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches),
  );
}
