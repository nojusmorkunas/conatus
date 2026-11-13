"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { focusTaskRow, keyName, shortcutsBlocked } from "@/lib/keyboard";

// The keys are Todoist's, so people coming from it keep their habits. Two-key
// sequences start with g (go to) or o (open); g i needs the Inbox's id.
const SEQUENCES: Record<string, string> = {
  gh: "/",
  gt: "/today",
  gu: "/upcoming",
  gv: "/filters-labels",
  gl: "/filters-labels",
  ga: "/reporting",
  op: "/stats",
  os: "/settings",
};

// "Mod" reads as ⌘ on a Mac and Ctrl elsewhere.
const HELP: [string, [string, string][]][] = [
  ["General", [
    ["q", "Quick Add"],
    ["a", "Add task to this list"],
    ["/, f or Mod K", "Search"],
    ["Mod Z", "Undo"],
    ["m", "Open or close the sidebar"],
    ["?", "Keyboard shortcuts"],
    ["Esc", "Close or cancel"],
  ]],
  ["Go to", [
    ["h", "Home"],
    ["g i", "Inbox"],
    ["g t", "Today"],
    ["g u", "Upcoming"],
    ["g v", "Filters & Labels"],
    ["g a", "Reporting"],
    ["o p", "Stats"],
    ["o s", "Settings"],
  ]],
  ["Tasks", [
    ["j or ↓", "Next task"],
    ["k or ↑", "Previous task"],
    ["Enter", "Open task"],
    ["e", "Complete"],
    ["1 to 4", "Set priority"],
    ["t", "Set date"],
    ["Shift T", "Remove date"],
    ["l", "Labels"],
    ["v", "Move to project"],
    ["Shift R", "Assign"],
    ["Shift E", "Show or hide subtasks"],
    [".", "More actions"],
  ]],
  ["Select", [
    ["x", "Select focused task"],
    ["Mod click", "Select task"],
    ["Shift click", "Select a range"],
    ["Delete", "Move selected to Trash"],
    ["Esc", "Clear selection"],
  ]],
  ["Project", [
    ["Shift V", "Switch list and board"],
    ["d", "Sort by date"],
    ["p", "Sort by priority"],
    ["n", "Sort by name"],
  ]],
];

export function KeyboardShortcuts({ inboxProjectId }: { inboxProjectId: string | null }) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    function open() {
      setShowHelp(true);
    }
    window.addEventListener("shortcuts:open", open);
    return () => window.removeEventListener("shortcuts:open", open);
  }, []);

  // Capture phase, so the second key of a sequence is spent here before a
  // focused task row reads it: g t goes to Today instead of setting a date.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (showHelp) {
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          setShowHelp(false);
        }
        event.stopPropagation();
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k" &&
          !document.querySelector("[aria-modal=true]")) {
        event.preventDefault();
        window.dispatchEvent(new Event("search:focus"));
        return;
      }

      if (shortcutsBlocked(event)) return;

      const key = keyName(event);
      if (pending.current) {
        const sequence = pending.current + key;
        pending.current = null;
        clearTimeout(timeout);
        event.preventDefault();
        event.stopPropagation();
        const href = sequence === "gi"
          ? inboxProjectId && `/projects/${inboxProjectId}`
          : SEQUENCES[sequence];
        if (href) router.push(href);
        return;
      }

      const target = event.target as Element;
      switch (key) {
        case "g":
        case "o":
          pending.current = key;
          timeout = setTimeout(() => (pending.current = null), 1000);
          return;
        case "q":
          window.dispatchEvent(new Event("quick-add:open"));
          break;
        case "a":
          // Pages without a list of their own fall back to Quick Add.
          window.dispatchEvent(new Event(
            document.querySelector("[data-quick-add]") ? "quick-add:focus" : "quick-add:open",
          ));
          break;
        case "/":
        case "f":
          window.dispatchEvent(new Event("search:focus"));
          break;
        case "m":
          window.dispatchEvent(new Event("sidebar:toggle"));
          break;
        case "h":
          router.push("/");
          break;
        case "?":
          setShowHelp(true);
          break;
        case "j":
        case "k":
          if (!focusTaskRow(target.closest("[data-task-id]"), key === "j" ? 1 : -1)) return;
          break;
        case "ArrowDown":
        case "ArrowUp":
          // The arrows keep scrolling the page until a task has focus.
          if (!target.matches("[data-task-id]")) return;
          focusTaskRow(target, key === "ArrowDown" ? 1 : -1);
          break;
        default:
          return;
      }
      // Keeps the key itself out of whatever just took focus.
      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timeout);
    };
  }, [router, inboxProjectId, showHelp]);

  if (!showHelp) return null;

  const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setShowHelp(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">Keyboard shortcuts</h2>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {HELP.map(([heading, rows]) => (
            <section key={heading}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{heading}</h3>
              <dl className="flex flex-col gap-1 text-sm">
                {rows.map(([keys, label]) => (
                  <div key={keys + label} className="flex justify-between gap-4">
                    <dt>{label}</dt>
                    <dd className="font-mono text-muted-foreground">{keys.replace("Mod", mod)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
