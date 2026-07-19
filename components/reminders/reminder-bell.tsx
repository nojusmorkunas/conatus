"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type DueReminder = {
  id: string;
  remindAt: string;
  taskId: string;
  taskContent: string;
  projectId: string;
};

export function ReminderBell() {
  const [reminders, setReminders] = useState<DueReminder[]>([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 48, width: 288 });
  const anchorRef = useRef<HTMLDivElement>(null);

  const positionPopup = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const edge = 8;
    const width = Math.min(288, window.innerWidth - edge * 2);
    setPosition({
      left: Math.min(Math.max(edge, anchor.left), window.innerWidth - width - edge),
      top: Math.min(anchor.bottom + 4, window.innerHeight - 96),
      width,
    });
  }, []);

  function refresh() {
    fetch("/api/reminders?due=1")
      .then((response) => (response.ok ? response.json() : []))
      .then(setReminders);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, positionPopup]);

  async function dismiss(id: string) {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen: true }),
    });
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  }

  return (
    <div ref={anchorRef} className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reminders"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-4" />
        {reminders.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[10px] leading-none text-destructive-foreground">
            {reminders.length}
          </span>
        )}
      </Button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Due reminders"
            className="fixed z-[100] max-h-[min(24rem,calc(100dvh-4rem))] overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg"
            style={{ left: position.left, top: position.top, width: position.width }}
          >
            {reminders.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No due reminders.</p>
            )}
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="group flex items-start justify-between gap-2 rounded-md p-2 hover:bg-muted/50"
              >
                <Link
                  href={`/projects/${reminder.projectId}`}
                  onClick={() => setOpen(false)}
                  className="flex-1 text-xs"
                >
                  <p className="truncate font-medium">{reminder.taskContent}</p>
                  <p className="text-muted-foreground">
                    {new Date(reminder.remindAt).toLocaleString()}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss reminder"
                  className="opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  onClick={() => dismiss(reminder.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </>
      , document.body)}
    </div>
  );
}
