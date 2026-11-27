"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, CloudOff, Info } from "lucide-react";

import { DecisionsDialog } from "@/components/offline/decisions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDecisions, useOffline, useOnline, useSnapshot, useSyncState } from "@/lib/offline/hooks";
import { backOnlineText, changesSynced, decisionsText } from "@/lib/offline/sync-status";
import type { SyncState } from "@/lib/offline/sync";
import { cn } from "@/lib/utils";

const SHRINK_AFTER_MS = 60_000;
const BACK_ONLINE_FOR_MS = 3_000;
const FADE_MS = 200;

const pill = "pointer-events-auto flex h-9 items-center rounded-full border border-border bg-popover text-xs text-popover-foreground shadow-md";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Offline: a pill that folds into its icon after a minute, and explains itself on hover or tap. */
function OfflinePill() {
  const [shrunk, setShrunk] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShrunk(true), SHRINK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const collapsed = shrunk && !hovered && !focused && !open;

  // Hover opens and closes on its own. A click pins it open until Escape or a click outside.
  const onOpenChange = (next: boolean, details: { reason: string }) => {
    if (details.reason === "trigger-press") {
      setOpen(true);
      setPinned(true);
      return;
    }
    if (!next && details.reason === "trigger-hover" && pinned) return;
    setOpen(next);
    if (!next) setPinned(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        openOnHover
        delay={0}
        data-slot="sync-status-pill"
        aria-label="You're offline. What works offline"
        data-collapsed={collapsed ? "" : undefined}
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={(event) => event.pointerType === "mouse" && setHovered(false)}
        // Keyboard focus only: a click also focuses the button, and that shouldn't hold it open.
        onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        className={cn(
          pill,
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          collapsed ? "w-9 justify-center" : "gap-1.5 px-3",
        )}
      >
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        <span
          className={cn(
            "flex items-center gap-1.5 overflow-hidden whitespace-nowrap motion-safe:transition-[max-width,opacity] motion-safe:duration-200",
            collapsed ? "max-w-0 opacity-0" : "max-w-64 opacity-100",
          )}
        >
          You&apos;re offline
          <Info className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </span>
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={8} className="w-80 space-y-2 p-3.5 text-xs leading-relaxed">
        <p className="text-sm font-semibold">Working offline</p>
        <p>Keep adding and editing as usual. Changes are saved on this device and sync on their own once you&apos;re back online.</p>
        <p>Pages you&apos;ve opened on this device still load.</p>
        <p className="text-muted-foreground">Attachments, sharing, assigning, imports and settings need a connection.</p>
      </PopoverContent>
    </Popover>
  );
}

function DecisionsPill({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div data-slot="sync-status-pill" className={cn(pill, "gap-1.5 border-destructive/50 px-3")}>
        <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
        {text}
        <button type="button" className="ml-0.5 font-medium underline underline-offset-2" onClick={() => setOpen(true)}>Review</button>
      </div>
      <DecisionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The one place sync speaks up, at the bottom of the main column: offline, back online with what
 * synced, and decisions waiting. The live region says the same things for screen readers.
 */
export function SyncStatus() {
  const online = useOnline();
  const { store, repo } = useOffline();
  const sync = useSyncState();
  const queuedNow = useSnapshot((snapshot) => snapshot.changes.size);
  const { conflicts, failedChanges } = useDecisions();
  // Set on each reconnect: what was queued then, and the sync state to wait past.
  const [reconnect, setReconnect] = useState<{ queued: number; start: SyncState } | null>(null);
  const [fading, setFading] = useState(false);
  const stack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // "online" only fires after an offline spell, so the back-online pill never shows on a normal load.
    const onOffline = () => {
      setReconnect(null);
      setFading(false);
    };
    const onOnline = () => {
      setReconnect({ queued: store.getSnapshot().changes.size, start: repo.getState() });
      setFading(false);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [store, repo]);

  // Toasts sit above the stack while it's showing, so they don't cover it.
  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--sync-status-height", `${el.offsetHeight + 8}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sync-status-height");
    };
  }, []);

  // The first sync after reconnecting is the one that matters: any new sync state means it ran.
  const finished = reconnect !== null && sync !== reconnect.start && sync.status !== "running";
  const synced = reconnect && finished && sync.status !== "failed" ? changesSynced(reconnect.queued, queuedNow) : 0;

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => setFading(true), BACK_ONLINE_FOR_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(() => setReconnect(null), reducedMotion() ? 0 : FADE_MS);
    return () => clearTimeout(timer);
  }, [fading]);

  const decisions = conflicts.length + failedChanges.length;
  const decisionsWords = decisionsText(conflicts.length, failedChanges.length);
  const backOnline = reconnect !== null && online;
  const announced = [
    !online && "You're offline.",
    backOnline && backOnlineText(synced),
    decisions > 0 && decisionsWords,
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={stack}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-center gap-2 px-4 md:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div role="status" className="sr-only">{announced}</div>
      {decisions > 0 && <DecisionsPill text={decisionsWords} />}
      {!online && <OfflinePill />}
      {backOnline && (
        <div
          data-slot="sync-status-pill"
          className={cn(
            pill,
            "gap-1.5 border-emerald-600 bg-emerald-600 px-3 text-white motion-safe:transition-opacity motion-safe:duration-200",
            fading && "opacity-0",
          )}
        >
          <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
          {finished ? backOnlineText(synced) : "You're back online"}
        </div>
      )}
    </div>
  );
}
