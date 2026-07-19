"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const HELP_TEXT = [
  ["/", "Search"],
  ["q", "Add task"],
  ["g i", "Go to Inbox"],
  ["g t", "Go to Today"],
  ["g u", "Go to Upcoming"],
];

export function KeyboardShortcuts({ inboxProjectId }: { inboxProjectId: string | null }) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const pendingG = useRef(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (pendingG.current) {
        pendingG.current = false;
        clearTimeout(timeout);
        if (event.key === "i" && inboxProjectId) router.push(`/projects/${inboxProjectId}`);
        else if (event.key === "t") router.push("/today");
        else if (event.key === "u") router.push("/upcoming");
        return;
      }

      if (event.key === "g") {
        pendingG.current = true;
        timeout = setTimeout(() => (pendingG.current = false), 1000);
        return;
      }

      if (event.key === "q") {
        window.dispatchEvent(new Event("quick-add:focus"));
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        window.dispatchEvent(new Event("search:focus"));
        return;
      }

      if (event.key === "?") {
        setShowHelp((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timeout);
    };
  }, [router, inboxProjectId]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="w-64 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-medium">Keyboard shortcuts</h2>
        <dl className="flex flex-col gap-1 text-sm">
          {HELP_TEXT.map(([key, label]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono">{key}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
